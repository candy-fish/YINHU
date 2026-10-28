import * as THREE from 'three';
import { GOLDEN_LIGHT } from './golden-light.js';

const SURFACE_CLEARANCE = 0.16;
const ANCHOR_TOLERANCE = 0.025;
const LEAF_SCALE = 0.58;

export function worldToTreePoint(pivot, worldPoint) {
    return pivot.worldToLocal(worldPoint.clone());
}

export function createThoughtLeaves(pivot) {
    const root = new THREE.Group();
    root.name = 'equipped-thoughts';
    pivot.add(root);
    const leaves = new Map();
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.15);
    shape.bezierCurveTo(-0.22, -0.03, -0.13, 0.15, 0.045, 0.25);
    shape.bezierCurveTo(0.19, 0.04, 0.15, -0.08, 0, -0.15);
    const geometry = new THREE.ShapeGeometry(shape, 32);
    const outline = shape.getPoints(32);
    // Feather the silhouette and paint a soft central vein instead of rigid line geometry.
    const material = new THREE.ShaderMaterial({
        uniforms: { uOutline: { value: outline },
            uGold: { value: new THREE.Color(GOLDEN_LIGHT.halo) },
            uCore: { value: new THREE.Color(GOLDEN_LIGHT.core) } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, toneMapped: false, forceSinglePass: true,
        vertexShader: `
            varying vec2 vLeaf;
            void main() {
                vLeaf = position.xy;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec2 uOutline[${outline.length}];
            uniform vec3 uGold;
            uniform vec3 uCore;
            varying vec2 vLeaf;
            void main() {
                float edgeDistance = 1.0;
                for (int i = 0; i < ${outline.length - 1}; i++) {
                    vec2 edge = uOutline[i + 1] - uOutline[i];
                    float t = clamp(dot(vLeaf - uOutline[i], edge) / max(dot(edge, edge), 0.000001), 0.0, 1.0);
                    edgeDistance = min(edgeDistance, length(vLeaf - uOutline[i] - edge * t));
                }
                float feather = smoothstep(0.0, 0.014, edgeDistance);
                float centerDistance = (vLeaf.x - 0.012) / 0.12;
                float center = exp(-centerDistance * centerDistance);
                float stemX = (vLeaf.y + 0.17) * 0.1125;
                float veinDistance = (vLeaf.x - stemX) / 0.009;
                float vein = exp(-veinDistance * veinDistance);
                float warmth = clamp(center * 0.55 + vein * 0.12 + (vLeaf.y + 0.15) * 0.4, 0.0, 1.0);
                vec3 gold = mix(uGold, uCore, warmth);
                gl_FragColor = vec4(gold * 1.08, feather * (0.38 + center * 0.12 + vein * 0.08));
            }
        `
    });
    // A broader, brighter halo fades smoothly to zero while respecting tree occlusion.
    const haloGeometry = new THREE.PlaneGeometry(0.82, 0.96);
    const haloMaterial = new THREE.ShaderMaterial({
        uniforms: { uGold: { value: new THREE.Color(GOLDEN_LIGHT.halo) } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, toneMapped: false,
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uGold;
            varying vec2 vUv;
            void main() {
                vec2 p = (vUv - 0.5) * 2.0;
                float radius = dot(p, p);
                float glow = (exp(-radius * 3.0) * 0.65 + exp(-radius * 11.0) * 0.35)
                    * (1.0 - smoothstep(0.55, 1.0, radius));
                gl_FragColor = vec4(uGold * 1.08, glow * 0.62);
            }
        `
    });
    const rotation = new THREE.Quaternion();
    const parentRotation = new THREE.Quaternion();
    const inverseRotation = new THREE.Quaternion();
    const cameraPosition = new THREE.Vector3();
    const anchorPosition = new THREE.Vector3();
    const toAnchor = new THREE.Vector3();
    const displayPosition = new THREE.Vector3();
    const surfaceNormal = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    const occlusionRay = new THREE.Raycaster();
    occlusionRay.firstHitOnly = true;
    const previousPivot = new THREE.Matrix4();
    const previousCamera = new THREE.Matrix4();
    let layoutDirty = true;
    let previousMeshCount = -1;
    return {
        get meshes() { return [...leaves.values()].filter(leaf => leaf.visible).map(leaf => leaf.children[0]); },
        sync(records) {
            layoutDirty = true;
            const equipped = new Set(records.filter(record => record.equipped).map(record => record.id));
            for (const [id, leaf] of leaves) {
                if (!equipped.has(id)) { root.remove(leaf); leaves.delete(id); }
            }
            for (const record of records) {
                if (!record.equipped) continue;
                let leaf = leaves.get(record.id);
                if (!leaf) {
                    leaf = new THREE.Group();
                    const body = new THREE.Mesh(geometry, material);
                    body.scale.setScalar(LEAF_SCALE);
                    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
                    halo.position.set(0, 0.04, -0.006);
                    body.add(halo);
                    leaf.add(body);
                    root.add(leaf);
                    leaves.set(record.id, leaf);
                }
                leaf.position.set(record.position.x, record.position.y, record.position.z);
                leaf.children[0].userData.thought = record;
            }
        },
        faceCamera(camera, treeMeshes = []) {
            if (treeMeshes === null) {
                for (const leaf of leaves.values()) leaf.visible = false;
                layoutDirty = true;
                return;
            }
            camera.updateWorldMatrix(true, false);
            if (!layoutDirty && previousMeshCount === treeMeshes.length
                && previousPivot.equals(pivot.matrixWorld) && previousCamera.equals(camera.matrixWorld)) return;
            layoutDirty = false;
            previousMeshCount = treeMeshes.length;
            previousPivot.copy(pivot.matrixWorld);
            previousCamera.copy(camera.matrixWorld);
            pivot.getWorldQuaternion(parentRotation).invert();
            camera.getWorldQuaternion(rotation).premultiply(parentRotation);
            inverseRotation.copy(rotation).invert();
            camera.getWorldPosition(cameraPosition);
            for (const leaf of leaves.values()) {
                leaf.quaternion.copy(rotation);
                anchorPosition.copy(leaf.position).applyMatrix4(pivot.matrixWorld);
                toAnchor.copy(anchorPosition).sub(cameraPosition);
                const distance = toAnchor.length();
                toAnchor.normalize();
                // Test the saved surface point before lifting the billboard. A lifted
                // leaf must never reveal an attachment hidden behind the tree.
                occlusionRay.set(cameraPosition, toAnchor);
                occlusionRay.far = distance + ANCHOR_TOLERANCE;
                const surfaceHit = treeMeshes.length ? occlusionRay.intersectObjects(treeMeshes, false)[0] : null;
                leaf.visible = !surfaceHit || surfaceHit.distance >= distance - ANCHOR_TOLERANCE;
                let clearance = SURFACE_CLEARANCE;
                if (leaf.visible && surfaceHit?.face) {
                    normalMatrix.getNormalMatrix(surfaceHit.object.matrixWorld);
                    surfaceNormal.copy(surfaceHit.face.normal).applyNormalMatrix(normalMatrix);
                    const cosine = Math.min(1, Math.abs(surfaceNormal.dot(toAnchor)));
                    // A billboard spans farther into bark when viewed at a grazing angle.
                    clearance = Math.max(clearance, Math.min(0.5,
                        ANCHOR_TOLERANCE + 0.14 * Math.sqrt(1 - cosine * cosine) / Math.max(cosine, 0.15)));
                }
                // Move along the exact viewing ray: the projected attachment stays
                // fixed while the small leaf clears the bark at oblique angles.
                clearance = Math.min(clearance, distance * 0.1);
                displayPosition.copy(anchorPosition).addScaledVector(toAnchor, -clearance);
                pivot.worldToLocal(displayPosition);
                leaf.children[0].position.copy(displayPosition).sub(leaf.position).applyQuaternion(inverseRotation);
                // Compensate perspective so lifting the leaf does not enlarge it on screen.
                leaf.children[0].scale.setScalar(LEAF_SCALE * (distance ? (distance - clearance) / distance : 1));
            }
        }
    };
}
