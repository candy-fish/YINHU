import * as THREE from 'three';
import { GOLDEN_LIGHT } from './golden-light.js';

const PARTICLE_COUNT = 760;

function createGeometry(size) {
    let state = 0x5ba3d81f;
    const random = () => {
        state = (Math.imul(state,1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const phases = new Float32Array(PARTICLE_COUNT);
    const brightness = new Float32Array(PARTICLE_COUNT);
    const centerY = size.y * 0.54;
    for (let index = 0; index < PARTICLE_COUNT; index++) {
        const angle = random() * Math.PI * 2;
        const vertical = random() * 2 - 1;
        const horizontal = Math.sqrt(1 - vertical * vertical);
        const radius = Math.pow(random(),0.42);
        positions[index * 3] = Math.cos(angle) * horizontal * radius * size.x * 0.7;
        positions[index * 3 + 1] = Math.max(0.28,centerY + vertical * radius * size.y * 0.64);
        positions[index * 3 + 2] = Math.sin(angle) * horizontal * radius * size.z * 0.7;
        sizes[index] = 0.01 + Math.pow(random(),2.7) * 0.03;
        phases[index] = random() * Math.PI * 2;
        brightness[index] = 0.45 + random() * 0.55;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
    geometry.setAttribute('aPhase',new THREE.BufferAttribute(phases,1));
    geometry.setAttribute('aBrightness',new THREE.BufferAttribute(brightness,1));
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius += 0.25;
    return geometry;
}

const vertexShader = `
    uniform float uTime;
    uniform float uViewportHeight;
    uniform float uScale;
    attribute float aSize;
    attribute float aPhase;
    attribute float aBrightness;
    varying float vAlpha;
    varying float vGlint;
    void main() {
        vec3 point = position;
        point.x += sin(uTime * 0.13 + aPhase) * 0.13
            + sin(uTime * 0.07 + position.y * 0.8) * 0.045;
        point.y += sin(uTime * 0.18 + aPhase * 1.4) * 0.11;
        point.z += cos(uTime * 0.11 + aPhase * 1.7) * 0.12;
        float glint = 0.5 + 0.5 * sin(uTime * (0.3 + aBrightness * 0.24) + aPhase);
        vAlpha = aBrightness * (0.3 + 0.7 * glint * glint);
        vGlint = glint;
        vec4 viewPosition = modelViewMatrix * vec4(point,1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(aSize * uScale * uViewportHeight * projectionMatrix[1][1]
            * 0.5 / max(0.1,-viewPosition.z),1.0,12.0);
        vAlpha *= smoothstep(0.7,2.0,-viewPosition.z);
    }
`;

const fragmentShader = `
    uniform vec3 uGold;
    uniform vec3 uCore;
    uniform float uOpacity;
    uniform float uHalo;
    varying float vAlpha;
    varying float vGlint;
    void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        float grain = exp(-radius * radius * mix(5.0,3.0,uHalo));
        grain *= 1.0 - smoothstep(0.65,1.0,radius);
        float alpha = grain * vAlpha * uOpacity;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(mix(uGold,uCore,vGlint * 0.12 * (1.0-uHalo)),alpha);
    }
`;

// Attach to the tree's stationary tilt frame, so dragging the tree changes its
// occlusion against the airborne dust without making the entire cloud spin.
export function createTreeAtmosphere(parent,size,viewportHeight = 720) {
    const root = new THREE.Group();
    root.name = 'tree-suspended-gold-dust';
    const geometry = createGeometry(size);
    const materials = [];
    let lastFrame = -Infinity;
    let resting = false;
    for (const halo of [true,false]) {
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 }, uViewportHeight: { value: viewportHeight },
                uScale: { value: halo ? 3.6 : 1 }, uHalo: { value: halo ? 1 : 0 },
                uOpacity: { value: halo ? 0.1 : 0.64 },
                uGold: { value: new THREE.Color(GOLDEN_LIGHT.halo) },
                uCore: { value: new THREE.Color(GOLDEN_LIGHT.core) }
            },
            vertexShader,fragmentShader,
            transparent: true, blending: THREE.AdditiveBlending,
            depthTest: true, depthWrite: false, toneMapped: false, fog: false
        });
        const points = new THREE.Points(geometry,material);
        points.name = halo ? 'airborne-gold-soft-glow' : 'airborne-gold-grains';
        points.renderOrder = 1;
        root.add(points);
        materials.push(material);
    }
    parent.add(root);
    return {
        root,
        resize(height) {
            for (const material of materials) material.uniforms.uViewportHeight.value = height;
        },
        update(now,reducedMotion) {
            if ((reducedMotion && resting) || (!reducedMotion && now - lastFrame < 1000 / 30)) return false;
            lastFrame = now;
            resting = reducedMotion;
            for (const material of materials) material.uniforms.uTime.value = reducedMotion ? 0 : now * 0.001;
            return true;
        }
    };
}
