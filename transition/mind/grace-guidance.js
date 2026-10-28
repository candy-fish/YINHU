import * as THREE from 'three';
import { GOLDEN_LIGHT } from './golden-light.js';

const COUNTS = [660, 590, 350, 700, 740];
const AMBIENT_COUNT = 180;
const PATH_SAMPLES = 256;

// Preserve the earlier left, right and low sweeping silhouettes. Only their
// depth changes: the left arc emerges from behind, the right passes behind the
// trunk, and the low arc floats across the foreground before reaching the grace.
const ARCS = [
    [[-3.05, 3.6, -1.8], [-3.55, 2.2, -2.8], [-1.7, 0.45, 1.25], [0, 0.2, 0.08]],
    [[3.3, 1.9, 1.0], [3.7, 0.5, -4.6], [1.7, -0.25, -3.7], [0, 0.2, 0.08]],
    [[-3.0, 0.95, 1.5], [-2.7, 0.25, 2.1], [-1.25, 0.12, 1.1], [0, 0.2, 0.08]]
];

// Additional strokes traced from the reference: a tall left cascade and an
// outer right S-curve. Shared handles keep each join smooth rather than angular.
const EXTRA_ARCS = [
    [
        [[-0.2, 5.8, 0.12], [-0.7, 5.95, 0.1], [-1.65, 5.78, -0.12], [-1.68, 4.9, -0.2]],
        [[-1.68, 4.9, -0.2], [-1.71, 4.02, -0.28], [-1.0, 3.45, -0.6], [-1.04, 2.65, -0.1]],
        [[-1.04, 2.65, -0.1], [-1.08, 1.85, 0.4], [-0.28, 0.95, 0.3], [0, 0.2, 0.08]]
    ],
    [
        [[5.0, 3.85, -0.4], [4.5, 3.55, -0.5], [4.58, 3.45, -0.6], [4.6, 2.75, -0.1]],
        [[4.6, 2.75, -0.1], [4.62, 2.05, 0.4], [5.45, 1.45, 0.6], [4.6, 0.95, 0.65]],
        [[4.6, 0.95, 0.65], [3.75, 0.45, 0.7], [1.4, 0.95, 0.35], [0, 0.2, 0.08]]
    ]
];

export function createGuidancePaths(anchor) {
    const paths = ARCS.map(points => {
        const curve = new THREE.CubicBezierCurve3(...points.map(point => new THREE.Vector3(...point).add(anchor)));
        curve.arcLengthDivisions = 1600;
        return curve;
    });
    for (const segments of EXTRA_ARCS) {
        const path = new THREE.CurvePath();
        for (const points of segments) {
            const curve = new THREE.CubicBezierCurve3(...points.map(point => new THREE.Vector3(...point).add(anchor)));
            curve.arcLengthDivisions = 600;
            path.add(curve);
        }
        path.arcLengthDivisions = 1600;
        paths.push(path);
    }
    return paths;
}

function createPathTexture(paths) {
    const data = new Float32Array(PATH_SAMPLES * paths.length * 4);
    paths.forEach((curve, route) => {
        for (let step = 0; step < PATH_SAMPLES; step++) {
            const point = curve.getPointAt(step / (PATH_SAMPLES - 1));
            const index = (route * PATH_SAMPLES + step) * 4;
            data.set([point.x, point.y, point.z, 1], index);
        }
    });
    const texture = new THREE.DataTexture(data, PATH_SAMPLES, paths.length, THREE.RGBAFormat, THREE.FloatType);
    // Interpolate explicitly so floating-point linear filtering isn't required.
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
}

function seededRandom() {
    let state = 0x723ac451;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function createGeometry() {
    const random = seededRandom();
    const count = COUNTS.reduce((sum, value) => sum + value, AMBIENT_COUNT);
    const positions = new Float32Array(count * 3);
    const routes = new Float32Array(count);
    const progress = new Float32Array(count);
    const scatter = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    let index = 0;
    for (let route = 0; route <= COUNTS.length; route++) {
        const routeCount = COUNTS[route] ?? AMBIENT_COUNT;
        for (let point = 0; point < routeCount; point++, index++) {
            const offset = index * 3;
            routes[index] = route;
            progress[index] = (point + random()) / routeCount;
            // Most grains stay in a narrow current; a few softly peel away.
            scatter[offset] = (random() + random() + random() - 1.5) * 0.8;
            scatter[offset + 1] = random() * 2 - 1;
            scatter[offset + 2] = random();
            sizes[index] = 0.012 + Math.pow(random(), 2) * 0.025;
            phases[index] = random() * Math.PI * 2;
            if (route === COUNTS.length) {
                const angle = random() * Math.PI * 2;
                const radius = 1.7 + random() * 1.9;
                positions[offset] = Math.cos(angle) * radius;
                positions[offset + 1] = 0.5 + Math.pow(random(), 1.5) * 3.8;
                positions[offset + 2] = Math.sin(angle) * radius * 0.86;
            }
        }
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, array, itemSize] of [
        ['position', positions, 3], ['aRoute', routes, 1], ['aProgress', progress, 1],
        ['aScatter', scatter, 3], ['aSize', sizes, 1], ['aPhase', phases, 1]
    ]) geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
    return geometry;
}

const curveShader = `
    uniform sampler2D uPaths;
    vec3 currentPoint(float route, float t) {
        float sampleIndex = clamp(t, 0.0, 1.0) * ${PATH_SAMPLES - 1}.0;
        float lower = floor(sampleIndex);
        float upper = min(lower + 1.0, ${PATH_SAMPLES - 1}.0);
        float row = (route + 0.5) / ${COUNTS.length}.0;
        vec3 a = texture2D(uPaths, vec2((lower + 0.5) / ${PATH_SAMPLES}.0, row)).xyz;
        vec3 b = texture2D(uPaths, vec2((upper + 0.5) / ${PATH_SAMPLES}.0, row)).xyz;
        return mix(a, b, fract(sampleIndex));
    }
    vec3 currentTangent(float route, float t) {
        return currentPoint(route, min(1.0, t + 0.002))
            - currentPoint(route, max(0.0, t - 0.002));
    }
    vec3 currentSide(vec3 tangent) {
        return normalize(vec3(tangent.z, 0.000001, -tangent.x));
    }
`;

const vertexShader = `
    ${curveShader}
    uniform float uTime;
    uniform float uMotion;
    uniform float uViewportHeight;
    uniform float uScale;
    attribute float aRoute;
    attribute float aProgress;
    attribute vec3 aScatter;
    attribute float aSize;
    attribute float aPhase;
    varying float vAlpha;
    varying float vWarmth;

    void main() {
        float time = uTime * uMotion;
        vec3 point = position;
        float sparkle = 0.5 + 0.5 * sin(time * (1.1 + aScatter.z) + aPhase);
        float brightness = 0.35 + 0.65 * pow(sparkle, 3.0);
        if (aRoute < ${COUNTS.length - 0.5}) {
            float t = fract(aProgress + time * (0.047 + aScatter.z * 0.018)
                + sin(time * 0.23 + aPhase) * 0.012);
            float s = 1.0 - t;
            point = currentPoint(aRoute, t);
            vec3 tangent = currentTangent(aRoute, t);
            vec3 side = currentSide(tangent);
            vec3 across = normalize(cross(normalize(tangent), side));
            float width = (0.035 + 0.11 * s) * (0.7 + aScatter.z);
            float envelope = pow(max(0.0, sin(t * 3.141593)), 0.85);
            float stray = smoothstep(0.68, 0.96, aScatter.z);
            float breeze = sin(t * 7.0 - time * 0.31 + aPhase);
            breeze += 0.38 * sin(t * 13.0 + time * 0.19 + aPhase * 1.7);
            float drift = breeze * (0.035 + stray * 0.25) * envelope;
            point += side * (aScatter.x * width * envelope + drift);
            point += normalize(tangent) * sin(time * 0.37 + aPhase) * stray * 0.075 * envelope;
            point += across * (aScatter.y * width + sin(time * 0.28 + t * 8.0 + aPhase)
                * (0.02 + stray * 0.12)) * envelope;
            float fade = smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.92, 1.0, t));
            float current = 0.55 + 0.45 * sin(t * 38.0 - time * 1.4 + aRoute);
            vAlpha = fade * brightness * (0.45 + current * 0.55);
        } else {
            point.x += sin(time * 0.19 + aPhase) * 0.09;
            point.y += sin(time * 0.26 + aPhase * 1.4) * 0.13;
            point.z += cos(time * 0.21 + aPhase) * 0.08;
            vAlpha = brightness * 0.65;
        }
        vWarmth = sparkle * 0.35;
        vec4 viewPosition = modelViewMatrix * vec4(point, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(aSize * uScale * uViewportHeight * projectionMatrix[1][1]
            * 0.5 / max(0.1, -viewPosition.z), 1.0, 22.0);
    }
`;

function createMistGeometry() {
    const segments = 144;
    const positions = [];
    const routes = [];
    const lanes = [];
    const indices = [];
    for (let route = 0; route < COUNTS.length; route++) {
        for (let lane = -1; lane <= 1; lane++) {
            const start = positions.length / 3;
            for (let step = 0; step <= segments; step++) {
                for (const side of [-1, 1]) {
                    positions.push(step / segments, side, 0);
                    routes.push(route);
                    lanes.push(lane);
                }
                if (step < segments) {
                    const index = start + step * 2;
                    indices.push(index, index + 1, index + 2, index + 2, index + 1, index + 3);
                }
            }
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aRoute', new THREE.Float32BufferAttribute(routes, 1));
    geometry.setAttribute('aLane', new THREE.Float32BufferAttribute(lanes, 1));
    geometry.setIndex(indices);
    return geometry;
}

const mistVertexShader = `
    ${curveShader}
    uniform float uTime;
    uniform float uMotion;
    attribute float aRoute;
    attribute float aLane;
    varying vec2 vMist;
    varying float vPhase;
    void main() {
        float time = uTime * uMotion;
        float t = position.x;
        float phase = aRoute * 2.7 + aLane * 1.9;
        float envelope = pow(max(0.0, sin(t * 3.141593)), 0.8);
        vec3 point = currentPoint(aRoute, t);
        vec3 tangent = currentTangent(aRoute, t);
        vec3 side = currentSide(tangent);
        float drift = sin(t * 7.5 - time * 0.26 + phase) * 0.075;
        drift += sin(t * 14.0 + time * 0.17 + phase * 1.3) * 0.018;
        point += side * (aLane * 0.11 + drift) * envelope;
        point.y += (0.06 + aLane * 0.04 + sin(t * 8.0 - time * 0.18 + phase) * 0.06) * envelope;
        float breath = 0.5 + 0.5 * sin(t * 12.0 - time * 0.32 + phase);
        float width = (0.012 + 0.024 * breath) * envelope;
        // Face only the narrow ribbon width toward the camera, while its path
        // remains attached to the tree in all three dimensions.
        vec3 viewTangent = (modelViewMatrix * vec4(tangent, 0.0)).xyz;
        vec2 viewSide = normalize(vec2(-viewTangent.y, viewTangent.x) + vec2(0.000001));
        vec4 viewPosition = modelViewMatrix * vec4(point, 1.0);
        viewPosition.xy += viewSide * position.y * width;
        gl_Position = projectionMatrix * viewPosition;
        vMist = vec2(t, position.y);
        vPhase = phase;
    }
`;

const mistFragmentShader = `
    uniform float uTime;
    uniform float uMotion;
    uniform vec3 uSmokeColor;
    varying vec2 vMist;
    varying float vPhase;
    void main() {
        float time = uTime * uMotion;
        float crossFade = exp(-vMist.y * vMist.y * 4.0)
            * (1.0 - smoothstep(0.55, 1.0, abs(vMist.y)));
        float ends = smoothstep(0.03, 0.22, vMist.x)
            * (1.0 - smoothstep(0.7, 0.98, vMist.x));
        float folds = 0.5 + 0.5 * sin(vMist.x * 19.0 - time * 0.55 + vPhase);
        float veil = 0.5 + 0.5 * sin(vMist.x * 9.0 - time * 0.29 + vPhase * 1.6);
        float alpha = crossFade * ends * (0.025 + 0.16 * folds * veil);
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(uSmokeColor, alpha);
    }
`;

const fragmentShader = `
    uniform vec3 uGold;
    uniform vec3 uCore;
    uniform float uOpacity;
    uniform float uHalo;
    varying float vAlpha;
    varying float vWarmth;
    void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        float grain = exp(-radius * radius * mix(4.5, 3.0, uHalo));
        grain *= 1.0 - smoothstep(0.65, 1.0, radius);
        float alpha = grain * vAlpha * uOpacity;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(mix(uGold, uCore, vWarmth * (1.0 - uHalo)), alpha);
    }
`;

export function createGraceGuidance(parent, anchor = new THREE.Vector3(-1.5, 0.4, 1)) {
    const root = new THREE.Group();
    root.name = 'grace-guiding-currents';
    const geometry = createGeometry();
    const pathTexture = createPathTexture(createGuidancePaths(anchor));
    const materials = [];
    for (const halo of [true, false]) {
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uPaths: { value: pathTexture },
                uTime: { value: 0 }, uMotion: { value: 1 }, uViewportHeight: { value: 720 },
                uScale: { value: halo ? 3.8 : 1 }, uHalo: { value: halo ? 1 : 0 },
                uOpacity: { value: halo ? 0.11 : 0.86 },
                uGold: { value: new THREE.Color(GOLDEN_LIGHT.halo) },
                uCore: { value: new THREE.Color(GOLDEN_LIGHT.core) }
            },
            vertexShader, fragmentShader,
            transparent: true, blending: THREE.AdditiveBlending,
            depthTest: true, depthWrite: false, toneMapped: false, fog: false
        });
        const points = new THREE.Points(geometry, material);
        points.name = halo ? 'grace-current-glow' : 'grace-current-grains';
        points.frustumCulled = false;
        points.renderOrder = halo ? 1 : 2;
        root.add(points);
        materials.push(material);
    }
    const mistMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uPaths: { value: pathTexture },
            uTime: { value: 0 }, uMotion: { value: 1 },
            uSmokeColor: { value: new THREE.Color(0xecebe5) }
        },
        vertexShader: mistVertexShader, fragmentShader: mistFragmentShader,
        transparent: true, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, forceSinglePass: true,
        depthTest: true, depthWrite: false, toneMapped: false, fog: false
    });
    const mist = new THREE.Mesh(createMistGeometry(), mistMaterial);
    mist.name = 'grace-floating-silk-mist';
    mist.frustumCulled = false;
    mist.renderOrder = 1;
    root.add(mist);
    materials.push(mistMaterial);
    parent.add(root);
    return {
        root,
        update(time, reducedMotion, viewportHeight) {
            for (const material of materials) {
                material.uniforms.uTime.value = reducedMotion ? 0 : time;
                material.uniforms.uMotion.value = reducedMotion ? 0 : 1;
                if (material.uniforms.uViewportHeight) material.uniforms.uViewportHeight.value = viewportHeight;
            }
        }
    };
}
