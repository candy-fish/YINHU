import * as THREE from 'three';
import { GOLDEN_LIGHT } from './golden-light.js';

// Sparse guides traced along the large limbs in the normalized model. Each is
// projected onto actual bark, so the resulting light inherits its depth and shape.
const TRACES = [
    { view: 'front', points: [[0.08,1.1],[-0.18,1.6],[-0.1,2.1],[0.1,2.55],[0.5,2.9],[0.83,3.38],[0.95,3.8],[1.2,4.05],[1.55,4.25]] },
    { view: 'front', points: [[0.14,1.08],[0.13,1.5],[0.18,1.9],[0.25,2.3],[0,2.7],[-0.6,3.1],[-1,3.5],[-1.17,3.92],[-1.62,4.2],[-2.2,4.3]] },
    { view: 'front', offset: 1.6, points: [[0.16,2.4],[0.7,2.75],[1.1,2.55],[1.4,2.35],[1.95,2.25],[2.5,2.1]] },
    { view: 'front', offset: 1.3, points: [[-0.1,2.2],[-0.65,2.05],[-1.2,2.06],[-1.65,2.25],[-2,2.5]] },
    { view: 'front', root: true, points: [[-2.1,0.18],[-1.5,0.38],[-0.95,0.65],[-0.4,0.9],[0.08,1.1]] },
    { view: 'front', root: true, points: [[2.05,0.15],[1.4,0.35],[0.8,0.65],[0.3,1.15]] },
    { view: 'back', points: [[-0.08,1.02],[0.2,1.6],[0.1,2.2],[-0.3,2.7],[-0.9,3.2],[-1,3.65],[-1.5,4.1],[-2.1,4.3]] },
    { view: 'back', offset: 1.8, points: [[0.1,2.25],[0.6,2.55],[1,2.9],[1.1,3.4],[1.2,3.7],[1.7,4.1]] },
    { view: 'back', root: true, points: [[-2.1,0.15],[-1.4,0.35],[-0.7,0.7],[-0.08,1.02]] },
    { view: 'back', root: true, points: [[2.1,0.12],[1.5,0.4],[0.8,0.8],[0.2,1.2]] },
    { view: 'right', points: [[0.2,1.2],[0.4,1.7],[0.2,2.2],[0.15,2.8],[0.5,3.4],[0.8,3.7],[1.2,4]] },
    { view: 'right', offset: 1.5, points: [[0.15,2.8],[-0.7,3],[-1,3.4],[-2,3.8],[-2.1,4.4]] },
    { view: 'right', root: true, points: [[2.2,0.12],[1.5,0.4],[0.8,0.8],[0.2,1.2]] }
];

const vertexShader = `
    uniform float uWidth;
    attribute vec3 aAcross;
    attribute float aSize;
    attribute float aDistance;
    attribute float aRoot;
    attribute vec2 aBarkUv;
    varying vec2 vVein;
    varying vec2 vBarkUv;
    varying float vRoot;
    void main() {
        float side = uv.x * 2.0 - 1.0;
        vec3 lifted = position + normal * 0.003
            + aAcross * side * aSize * uWidth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(lifted, 1.0);
        vVein = vec2(side, aDistance);
        vBarkUv = aBarkUv;
        vRoot = aRoot;
    }
`;

const fragmentShader = `
    uniform float uTime;
    uniform float uOpacity;
    uniform vec3 uGold;
    uniform sampler2D uBarkMap;
    uniform mat3 uBarkTransform;
    uniform float uUseMap;
    uniform float uMapSRGB;
    varying vec2 vVein;
    varying vec2 vBarkUv;
    varying float vRoot;
    void main() {
        float edge = exp(-vVein.x * vVein.x * 4.0)
            * (1.0 - smoothstep(0.6, 1.0, abs(vVein.x)));
        float wave = 0.5 + 0.5 * cos((vVein.y - uTime * 0.24) * 2.617994);
        float flow = pow(wave, 6.0);
        float grain = 0.82 + 0.18 * sin(vVein.y * 57.0);
        vec3 bark = texture2D(uBarkMap, (uBarkTransform * vec3(vBarkUv, 1.0)).xy).rgb;
        // sRGB textures are decoded by the GPU; classify their original tones.
        vec3 encoded = mix(12.92 * bark,
            1.055 * pow(max(bark, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
            step(vec3(0.0031308), bark));
        bark = mix(bark, encoded, uMapSRGB);
        float warmth = (bark.r - bark.b) / max(bark.r, 0.03);
        float luminance = dot(bark, vec3(0.2126, 0.7152, 0.0722));
        float wood = smoothstep(0.16, 0.34, warmth)
            * (1.0 - smoothstep(0.62, 0.8, luminance));
        // Stronger albedo filtering on the roots keeps pale rocks from glowing.
        float mask = mix(1.0, mix(0.65 + wood * 0.35, wood, vRoot), uUseMap);
        float alpha = edge * (0.028 + flow * 0.48) * grain * uOpacity * mask;
        if (alpha < 0.0015) discard;
        gl_FragColor = vec4(uGold * (1.0 + flow * 0.15), alpha);
    }
`;

function traceRay(view, horizontal, vertical, origin, direction) {
    if (view === 'back') {
        origin.set(-horizontal, vertical, -8); direction.set(0, 0, 1);
    } else if (view === 'right') {
        origin.set(8, vertical, -horizontal); direction.set(-1, 0, 0);
    } else {
        origin.set(horizontal, vertical, 8); direction.set(0, 0, -1);
    }
}

export function createTreeVeins(pivot) {
    const root = new THREE.Group();
    root.name = 'tree-golden-veins';
    pivot.add(root);
    const materials = [];
    let lastFrame = -Infinity;
    let resting = false;

    return {
        root,
        async build(meshes, traces = TRACES) {
            pivot.updateWorldMatrix(true, true);
            const pivotWorld = new THREE.Matrix4();
            const inversePivot = new THREE.Matrix4();
            const normalToLocal = new THREE.Matrix3();
            const normalMatrix = new THREE.Matrix3();
            const ray = new THREE.Raycaster();
            ray.firstHitOnly = true;
            const origin = new THREE.Vector3();
            const direction = new THREE.Vector3();
            const attributes = { position: [], normal: [], aAcross: [], aSize: [], aDistance: [], aRoot: [], aBarkUv: [], uv: [] };
            const indices = [];
            for (const trace of traces) {
                // The user may rotate the tree between these short batches.
                pivot.updateWorldMatrix(true, true);
                pivotWorld.copy(pivot.matrixWorld);
                inversePivot.copy(pivotWorld).invert();
                normalToLocal.setFromMatrix4(pivotWorld).transpose();
                const guide = new THREE.CatmullRomCurve3(trace.points.map(([x,y]) => new THREE.Vector3(x,y,0)), false, 'centripetal');
                const length = guide.getLength();
                const count = Math.max(12, Math.ceil(length / 0.035));
                const samples = [];
                let distance = trace.offset ?? 0;
                for (let index = 0; index <= count; index++) {
                    const point = guide.getPointAt(index / count);
                    traceRay(trace.view, point.x, point.y, origin, direction);
                    ray.set(origin.clone().applyMatrix4(pivotWorld), direction.clone().transformDirection(pivotWorld));
                    const hit = ray.intersectObjects(meshes, false)[0];
                    if (!hit?.face) { samples.push(null); continue; }
                    normalMatrix.getNormalMatrix(hit.object.matrixWorld);
                    const position = hit.point.clone().applyMatrix4(inversePivot);
                    const normal = hit.face.normal.clone().applyNormalMatrix(normalMatrix).applyMatrix3(normalToLocal).normalize();
                    const previous = samples.at(-1);
                    const gap = previous ? previous.position.distanceTo(position) : 0;
                    if (previous && gap < 0.18) distance += gap;
                    else distance += 0.035;
                    samples.push({ position, normal, uv: hit.uv?.clone() ?? new THREE.Vector2(), distance });
                }
                for (let index = 0; index < samples.length - 1; index++) {
                    const a = samples[index], b = samples[index + 1];
                    if (!a || !b || a.position.distanceTo(b.position) > 0.18 || a.normal.dot(b.normal) < -0.2
                        || a.uv.distanceTo(b.uv) > 0.15) continue;
                    const tangent = b.position.clone().sub(a.position).normalize();
                    if (tangent.lengthSq() < 0.5) continue;
                    const start = attributes.position.length / 3;
                    for (const sample of [a,b]) {
                        const across = sample.normal.clone().cross(tangent).normalize();
                        if (across.lengthSq() < 0.5) across.set(1,0,0);
                        const size = 0.006 + 0.0018 * Math.sin(sample.distance * 8.0);
                        for (const side of [0,1]) {
                            attributes.position.push(...sample.position);
                            attributes.normal.push(...sample.normal);
                            attributes.aAcross.push(...across);
                            attributes.aSize.push(size);
                            attributes.aDistance.push(sample.distance);
                            attributes.aRoot.push(trace.root ? 1 : 0);
                            attributes.aBarkUv.push(sample.uv.x, sample.uv.y);
                            attributes.uv.push(side,0);
                        }
                    }
                    indices.push(start,start+1,start+2,start+2,start+1,start+3);
                }
                // Surface sampling happens once, in short batches after BVH indexing.
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            if (!indices.length) return;
            const geometry = new THREE.BufferGeometry();
            for (const [name, values] of Object.entries(attributes)) {
                const size = ['position','normal','aAcross'].includes(name) ? 3 : ['uv','aBarkUv'].includes(name) ? 2 : 1;
                geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
            }
            geometry.setIndex(indices);
            geometry.computeBoundingSphere();
            const source = meshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]).find(material => material.map)?.map;
            const fallback = new THREE.DataTexture(new Uint8Array([105,75,45,255]),1,1);
            fallback.needsUpdate = true;
            source?.updateMatrix();
            for (const halo of [true,false]) {
                const material = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0 }, uWidth: { value: halo ? 6.0 : 2.3 },
                        uOpacity: { value: halo ? 0.22 : 0.95 },
                        uGold: { value: new THREE.Color(GOLDEN_LIGHT.halo) },
                        uBarkMap: { value: source ?? fallback },
                        uBarkTransform: { value: source?.matrix.clone() ?? new THREE.Matrix3() },
                        uUseMap: { value: source ? 1 : 0 },
                        uMapSRGB: { value: source?.colorSpace === THREE.SRGBColorSpace ? 1 : 0 }
                    },
                    vertexShader, fragmentShader,
                    transparent: true, blending: THREE.AdditiveBlending,
                    depthTest: true, depthWrite: false, side: THREE.DoubleSide,
                    forceSinglePass: true, toneMapped: false,
                    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
                });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.name = halo ? 'tree-vein-soft-glow' : 'tree-vein-flow';
                mesh.renderOrder = 1;
                root.add(mesh);
                materials.push(material);
            }
            lastFrame = -Infinity;
            resting = false;
        },
        update(now, reducedMotion) {
            if (!materials.length || (reducedMotion && resting) || (!reducedMotion && now - lastFrame < 1000 / 30)) return false;
            lastFrame = now;
            resting = reducedMotion;
            for (const material of materials) material.uniforms.uTime.value = reducedMotion ? 0 : now * 0.001;
            return true;
        }
    };
}
