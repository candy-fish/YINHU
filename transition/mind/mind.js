import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { createCabinet } from "./mind-cabinet.js";
import { createThoughtLeaves, worldToTreePoint } from "./thought-leaves.js";
import { GOLDEN_LIGHT } from "./golden-light.js";
import { createGraceGuidance } from "./grace-guidance.js";
import { createTreeVeins } from "./tree-veins.js";
import { createTreeAtmosphere } from "./tree-atmosphere.js";
import { fetchTreeModelParts } from "./tree-model-loader.js";
import { generateBoundsTree } from "./tree-raycast.js";
import { createMindJourney } from "./entry-journey.js";

const MODEL_URL = window.BLACKDOOR_ASSETS?.models?.tree || "../../models/tree.glb";
const PICK_INTERVAL = 70;
const ROTATION_SENSITIVITY = 0.006;
const FIXED_TILT = THREE.MathUtils.degToRad(11);
const GRACE_ANCHOR = new THREE.Vector3(-1.5, 0.4, 1);
const GRACE_PARTICLE_COUNT = 320;
const GRACE_TIP_PARTICLE_COUNT = 34;
const GRACE_DUST_COUNT = 64;
const GRACE_PARTICLE_SEED = 0x6a09e667;
const GRACE_HEIGHT = 0.68;
const GRACE_WIDTH = 0.197;
const GRACE_DEPTH = 0.035;
const GRACE_TIP_LENGTH = 0.13;
const GRACE_LIGHT_INTENSITY = 1.6;
const GRACE_GROUND_LIGHT_INTENSITY = 1.25;
const GRACE_CORE_OPACITY = 0.2;
const GRACE_HALO_OPACITY = 0.07;
const GRACE_DUST_OPACITY = 0.58;
const GRACE_FRAME_INTERVAL = 1000 / 30;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const host = document.getElementById("mindScene");
const cursorElement = document.getElementById("mindCursor");
const coordinatesElement = document.getElementById("mindCoordinates");
const graceEntrance = document.getElementById("graceEntrance");
const leafTooltip = document.getElementById("leafTooltip");
const sceneStatus = document.getElementById("sceneStatus");
const pickerMessage = document.getElementById("pickerMessage");

if (!host || !cursorElement || !coordinatesElement) {
    throw new Error("Mind scene could not start: required DOM nodes are missing.");
}

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050706, 0.035);

const camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, 0.05, 100);
const cameraTarget = new THREE.Vector3(0, 3, 0);

const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance"
});
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
renderer.setSize(host.clientWidth, host.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
host.appendChild(renderer.domElement);

// Keep the viewing tilt separate from the user's horizontal rotation. This
// makes the tree lean toward the viewer by the same amount at every yaw.
const tiltRoot = new THREE.Group();
tiltRoot.rotation.x = FIXED_TILT;
scene.add(tiltRoot);

const treePivot = new THREE.Group();
tiltRoot.add(treePivot);
const thoughtLeaves = createThoughtLeaves(treePivot);

const hemisphereLight = new THREE.HemisphereLight(0xe8eee5, 0x10140f, 1.7);
scene.add(hemisphereLight);

const keyLight = new THREE.DirectionalLight(0xfff3da, 3.1);
keyLight.position.set(-4.5, 8, 6);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x7da48b, 2.2);
rimLight.position.set(5, 5, -6);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0x8b9ea8, 0.85);
fillLight.position.set(-5, 2, -4);
scene.add(fillLight);

const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
const pointerNdc = new THREE.Vector2();
const interactiveMeshes = [];
const meshesByGeometry = new Map();
const localInteractionSphere = new THREE.Sphere();
const worldInteractionSphere = new THREE.Sphere();
const coordinatePoint = new THREE.Vector3();
const graceScreenPoint = new THREE.Vector3();

const pointer = {
    actualX: window.innerWidth / 2,
    actualY: window.innerHeight / 2,
    previousX: 0,
    previousY: 0,
    previousTime: 0,
    pointerId: null,
    dragging: false,
    hasMoved: false,
    downX: 0,
    downY: 0,
    moved: false,
    startedOnGrace: false
};

const rotation = {
    yaw: -0.22,
    targetYaw: -0.22,
    velocityYaw: 0
};
treePivot.rotation.y = rotation.yaw;

const view = {
    modelSize: null,
    distance: 11
};

let treeModel = null;
let treeVeins = null;
let treeAtmosphere = null;
let siteOfGrace = null;
let lastFrameTime = performance.now();
let lastGraceFrameTime = 0;
let lastPickTime = 0;
let displayedCoordinates = "";
let sceneNeedsRender = true;
const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
let cabinetOpen = false;
let pickingPoint = false;
let animationFrameId = null;

function requestSceneFrame() {
    if (animationFrameId === null && !cabinetOpen && !document.hidden) {
        animationFrameId = requestAnimationFrame(animate);
    }
}

function setCabinetOpen(open) {
    cabinetOpen = open;
    pickingPoint = false;
    document.body.classList.toggle('cabinet-open', open);
    document.body.classList.remove('is-picking');
    document.getElementById('pointPicker').hidden = true;
    host.inert = open;
    pointer.dragging = false;
    pointer.hasMoved = false;
    rotation.velocityYaw = 0;
    rotation.targetYaw = rotation.yaw;
    cursorElement.classList.remove('is-dragging');
    clearCoordinates();
    leafTooltip.hidden = true;
    cabinet.setVisible(open);
    if (open) {
        if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    } else {
        lastFrameTime = performance.now();
        sceneNeedsRender = true;
        onResize();
        if (!graceEntrance.hidden) graceEntrance.focus({ preventScroll: true });
        requestSceneFrame();
    }
}

function enterCabinet() {
    if (location.hash !== '#cabinet') location.hash = 'cabinet';
    setCabinetOpen(true);
}

function leaveCabinet() {
    history.replaceState(null, '', location.pathname + location.search);
    setCabinetOpen(false);
}

function beginPointPick() {
    // Leave the hash in place so cancelling or completing returns to the same cabinet.
    setCabinetOpen(false);
    pickingPoint = true;
    document.body.classList.add('is-picking');
    graceEntrance.hidden = true;
    document.getElementById('pointPicker').hidden = false;
    pickerMessage.textContent = host.dataset.raycastReady === 'true'
        ? ''
        : host.dataset.raycastReady === 'failed' ? '树表面准备失败，请刷新后重试。' : '正在准备树表面取点…';
    document.getElementById('cancelPick').focus();
}

function positionGraceEntrance() {
    if (!siteOfGrace || cabinetOpen) return;
    graceScreenPoint.set(0, 0.3, 0);
    siteOfGrace.group.localToWorld(graceScreenPoint).project(camera);
    graceEntrance.hidden = pickingPoint || graceScreenPoint.z < -1 || graceScreenPoint.z > 1;
    const rect = host.getBoundingClientRect();
    graceEntrance.style.left = `${(graceScreenPoint.x + 1) * rect.width / 2}px`;
    graceEntrance.style.top = `${(1 - graceScreenPoint.y) * rect.height / 2}px`;
}

function createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function createGraceMask() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    context.beginPath();
    context.moveTo(64, 250);
    context.bezierCurveTo(55, 218, 30, 160, 26, 98);
    context.bezierCurveTo(22, 43, 36, 16, 64, 10);
    context.bezierCurveTo(92, 16, 106, 43, 102, 98);
    context.bezierCurveTo(98, 160, 73, 218, 64, 250);
    context.closePath();
    context.fillStyle = "#fff";
    context.fill();
    return context.getImageData(0, 0, canvas.width, canvas.height);
}

function createGraceGeometry() {
    const random = createSeededRandom(GRACE_PARTICLE_SEED);
    const mask = createGraceMask();
    const bodyParticleCount = GRACE_PARTICLE_COUNT - GRACE_TIP_PARTICLE_COUNT;
    const positions = new Float32Array(GRACE_PARTICLE_COUNT * 3);
    const sizes = new Float32Array(GRACE_PARTICLE_COUNT);
    const aspects = new Float32Array(GRACE_PARTICLE_COUNT);
    const angles = new Float32Array(GRACE_PARTICLE_COUNT);
    const phases = new Float32Array(GRACE_PARTICLE_COUNT);
    const brightness = new Float32Array(GRACE_PARTICLE_COUNT);
    const sections = new Float32Array(GRACE_PARTICLE_COUNT);

    for (let index = 0; index < GRACE_PARTICLE_COUNT; index += 1) {
        const positionOffset = index * 3;

        if (index >= bodyParticleCount) {
            const tipIndex = index - bodyParticleCount;
            const tipProgress = (tipIndex + random()) / GRACE_TIP_PARTICLE_COUNT;
            const tipWidth = 0.023 * Math.pow(1 - tipProgress, 1.45);
            const tipCurve = Math.sin(tipProgress * Math.PI) * 0.012;

            positions[positionOffset] = tipCurve + (random() - 0.5) * tipWidth * 2;
            positions[positionOffset + 1] = 0.025 - tipProgress * GRACE_TIP_LENGTH + (random() - 0.5) * 0.004;
            positions[positionOffset + 2] = (random() - 0.5) * GRACE_DEPTH * 0.7;
            sizes[index] = 0.085 + (1 - tipProgress) * 0.055 + random() * 0.035;
            aspects[index] = 1.65 + random() * 0.85;
            angles[index] = -0.1 + (random() - 0.5) * 0.28;
            phases[index] = random() * Math.PI * 2;
            brightness[index] = 0.64 + (1 - tipProgress) * 0.18 + random() * 0.12;
            sections[index] = -1;
            continue;
        }

        let pixelX = 0;
        let pixelY = 0;

        do {
            const centerBiased = random() < 0.48;
            const horizontalSample = centerBiased
                ? (random() + random() + random()) / 3
                : random();
            pixelX = Math.min(mask.width - 1, Math.floor(horizontalSample * mask.width));
            pixelY = Math.min(mask.height - 1, Math.floor(random() * mask.height));
        } while (mask.data[(pixelY * mask.width + pixelX) * 4 + 3] < 128);

        const normalizedX = pixelX / (mask.width - 1) - 0.5;
        const normalizedY = 1 - pixelY / (mask.height - 1);
        const centerWeight = 1 - Math.min(1, Math.abs(normalizedX) / 0.31);
        const verticalWeight = Math.max(0, 1 - Math.abs(normalizedY - 0.52) * 2.15);
        const coreWeight = centerWeight * (0.58 + verticalWeight * 0.42);
        const sectionBoundary = 0.49 + (random() - 0.5) * 0.07;

        positions[positionOffset] = normalizedX * GRACE_WIDTH + (random() - 0.5) * 0.004;
        positions[positionOffset + 1] = normalizedY * GRACE_HEIGHT + (random() - 0.5) * 0.006;
        positions[positionOffset + 2] = (random() - 0.5) * GRACE_DEPTH * 2;
        const particleSize = 0.1 + random() * 0.085 + coreWeight * 0.07;
        sizes[index] = particleSize * (1 + Math.pow(coreWeight, 1.8));
        aspects[index] = 1.45 + random() * 1.15;
        angles[index] = -normalizedX * 0.9 + (random() - 0.5) * 0.8;
        phases[index] = random() * Math.PI * 2;
        brightness[index] = 0.55 + coreWeight * 0.3 + random() * 0.15;
        sections[index] = THREE.MathUtils.clamp((normalizedY - sectionBoundary) / 0.055, -1, 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aAspect", new THREE.BufferAttribute(aspects, 1));
    geometry.setAttribute("aAngle", new THREE.BufferAttribute(angles, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aBrightness", new THREE.BufferAttribute(brightness, 1));
    geometry.setAttribute("aSection", new THREE.BufferAttribute(sections, 1));
    geometry.computeBoundingSphere();
    return geometry;
}

const GRACE_VERTEX_SHADER = `
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uMotion;
    uniform float uPointScale;
    uniform float uPeripheralScale;

    attribute float aSize;
    attribute float aAspect;
    attribute float aAngle;
    attribute float aPhase;
    attribute float aBrightness;
    attribute float aSection;

    varying float vAspect;
    varying float vAngle;
    varying float vBrightness;
    varying float vPulse;
    varying float vPhase;

    void main() {
        vec3 animatedPosition = position;
        float sharedBreath = sin(uTime * 1.2);
        float sectionBreath = sharedBreath * aSection * uMotion;
        float drift = sin(uTime * 1.45 + aPhase + position.y * 13.0);
        animatedPosition.x *= 1.0 + sectionBreath * 0.035;
        animatedPosition.x += drift * 0.0045 * uMotion;
        animatedPosition.y += sectionBreath * 0.018;
        animatedPosition.y += sin(uTime * 0.82 + aPhase * 1.7) * 0.0025 * uMotion;
        animatedPosition.z += cos(uTime * 1.08 + aPhase) * 0.002 * uMotion;

        vec4 viewPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
        float localPulse = sin(uTime * 2.05 + aPhase) * 0.025 * uMotion;
        vPulse = 1.0 + sectionBreath * 0.12 + localPulse;
        float peripheralWeight = smoothstep(0.72, 0.94, aBrightness);
        float densityScale = mix(uPeripheralScale, 1.0, peripheralWeight);
        gl_PointSize = max(1.0, aSize * uPointScale * densityScale * vPulse * uPixelRatio * (320.0 / -viewPosition.z));
        gl_Position = projectionMatrix * viewPosition;

        vAspect = aAspect;
        vAngle = aAngle;
        vBrightness = aBrightness;
        vPhase = aPhase;
    }
`;

const GRACE_FRAGMENT_SHADER = `
    uniform vec3 uColor;
    uniform float uOpacity;

    varying float vAspect;
    varying float vAngle;
    varying float vBrightness;
    varying float vPulse;
    varying float vPhase;

    void main() {
        vec2 point = gl_PointCoord - 0.5;
        float sine = sin(vAngle);
        float cosine = cos(vAngle);
        vec2 brush = mat2(cosine, -sine, sine, cosine) * point;
        brush.x *= vAspect;

        float grain = sin(brush.y * 58.0 + vPhase * 3.1) * 0.018;
        grain += sin(brush.x * 34.0 - vPhase * 2.3) * 0.012;
        float distanceToStroke = length(brush);
        float stroke = 1.0 - smoothstep(0.39 + grain, 0.51 + grain, distanceToStroke);
        float bristle = 0.88 + 0.12 * sin((brush.y + brush.x * 0.35) * 92.0 + vPhase * 5.0);
        float alpha = stroke * bristle * uOpacity * vBrightness * vPulse;

        if (alpha < 0.008) discard;
        gl_FragColor = vec4(uColor * (0.82 + vBrightness * 0.26), alpha);
    }
`;

function createGraceMaterial(color, opacity, pointScale, peripheralScale = 1) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uPixelRatio: { value: renderer.getPixelRatio() },
            uMotion: { value: reducedMotion.matches ? 0 : 1 },
            uPointScale: { value: pointScale },
            uPeripheralScale: { value: peripheralScale },
            uColor: { value: new THREE.Color(color) },
            uOpacity: { value: opacity }
        },
        vertexShader: GRACE_VERTEX_SHADER,
        fragmentShader: GRACE_FRAGMENT_SHADER,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        fog: false,
        toneMapped: false
    });
}

function createGraceDustGeometry() {
    const random = createSeededRandom(GRACE_PARTICLE_SEED ^ 0x9e3779b9);
    const positions = new Float32Array(GRACE_DUST_COUNT * 3);
    const sizes = new Float32Array(GRACE_DUST_COUNT);
    const phases = new Float32Array(GRACE_DUST_COUNT);
    const brightness = new Float32Array(GRACE_DUST_COUNT);
    const speeds = new Float32Array(GRACE_DUST_COUNT);

    for (let index = 0; index < GRACE_DUST_COUNT; index += 1) {
        const angle = random() * Math.PI * 2;
        const radius = 0.46 + Math.sqrt(random()) * 0.54;
        const positionOffset = index * 3;

        positions[positionOffset] = Math.cos(angle) * 0.28 * radius;
        positions[positionOffset + 1] = 0.31 + Math.sin(angle) * 0.46 * radius;
        positions[positionOffset + 2] = 0.055 + (random() - 0.5) * 0.024;
        sizes[index] = 0.04 + random() * 0.045;
        phases[index] = random() * Math.PI * 2;
        brightness[index] = 0.46 + random() * 0.54;
        speeds[index] = 0.75 + random() * 1.35;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aBrightness", new THREE.BufferAttribute(brightness, 1));
    geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    geometry.computeBoundingSphere();
    return geometry;
}

const GRACE_DUST_VERTEX_SHADER = `
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uMotion;

    attribute float aSize;
    attribute float aPhase;
    attribute float aBrightness;
    attribute float aSpeed;

    varying float vBrightness;
    varying float vFlicker;

    void main() {
        vec3 animatedPosition = position;
        animatedPosition.x += sin(uTime * 0.72 + aPhase) * 0.008 * uMotion;
        animatedPosition.y += cos(uTime * 0.58 + aPhase * 1.4) * 0.005 * uMotion;

        vec4 viewPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
        float flickerWave = 0.5 + 0.5 * sin(uTime * aSpeed + aPhase);
        vFlicker = mix(0.68, 0.12 + 0.88 * flickerWave * flickerWave, uMotion);
        vBrightness = aBrightness;
        gl_PointSize = max(1.0, aSize * uPixelRatio * (320.0 / -viewPosition.z));
        gl_Position = projectionMatrix * viewPosition;
    }
`;

const GRACE_DUST_FRAGMENT_SHADER = `
    uniform vec3 uColor;
    uniform float uOpacity;

    varying float vBrightness;
    varying float vFlicker;

    void main() {
        float distanceToCenter = length(gl_PointCoord - 0.5) * 2.0;
        float particle = 1.0 - smoothstep(0.18, 1.0, distanceToCenter);
        float alpha = particle * uOpacity * vBrightness * vFlicker;
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(uColor, alpha);
    }
`;

function createGraceDustMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uPixelRatio: { value: renderer.getPixelRatio() },
            uMotion: { value: reducedMotion.matches ? 0 : 1 },
            uColor: { value: new THREE.Color(GOLDEN_LIGHT.dust) },
            uOpacity: { value: GRACE_DUST_OPACITY }
        },
        vertexShader: GRACE_DUST_VERTEX_SHADER,
        fragmentShader: GRACE_DUST_FRAGMENT_SHADER,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        fog: false,
        toneMapped: false
    });
}

function createSiteOfGrace() {
    const group = new THREE.Group();
    group.name = "site-of-grace";
    group.position.copy(GRACE_ANCHOR);

    const facingRoot = new THREE.Group();
    facingRoot.name = "site-of-grace-facing-root";
    facingRoot.rotation.y = -rotation.yaw;
    group.add(facingRoot);

    const guidance = createGraceGuidance(treePivot, GRACE_ANCHOR);
    guidance.update(0, reducedMotion.matches, host.clientHeight * renderer.getPixelRatio());

    const dustPoints = new THREE.Points(createGraceDustGeometry(), createGraceDustMaterial());
    dustPoints.name = "site-of-grace-dust";
    dustPoints.renderOrder = 1;
    dustPoints.frustumCulled = false;
    facingRoot.add(dustPoints);

    const geometry = createGraceGeometry();
    const haloPoints = new THREE.Points(geometry, createGraceMaterial(GOLDEN_LIGHT.halo, GRACE_HALO_OPACITY, 1.65));
    haloPoints.name = "site-of-grace-halo";
    haloPoints.renderOrder = 1;
    haloPoints.frustumCulled = false;
    facingRoot.add(haloPoints);

    const corePoints = new THREE.Points(geometry, createGraceMaterial(GOLDEN_LIGHT.core, GRACE_CORE_OPACITY, 1, 0.92));
    corePoints.name = "site-of-grace-core";
    corePoints.renderOrder = 2;
    corePoints.frustumCulled = false;
    facingRoot.add(corePoints);

    const light = new THREE.PointLight(GOLDEN_LIGHT.dust, GRACE_LIGHT_INTENSITY, 0.82, 2);
    light.name = "site-of-grace-light";
    light.position.y = 0.24;
    light.castShadow = false;
    group.add(light);

    const groundLight = new THREE.PointLight(GOLDEN_LIGHT.halo, GRACE_GROUND_LIGHT_INTENSITY, 1.35, 2);
    groundLight.name = "site-of-grace-ground-light";
    groundLight.position.y = 0.035;
    groundLight.castShadow = false;
    group.add(groundLight);

    treePivot.add(group);
    siteOfGrace = {
        group,
        facingRoot,
        guidance,
        dustPoints,
        corePoints,
        haloPoints,
        light,
        groundLight,
        restApplied: false
    };
}

function applyGraceRestState() {
    if (!siteOfGrace || siteOfGrace.restApplied) return false;
    siteOfGrace.group.position.y = GRACE_ANCHOR.y;
    siteOfGrace.corePoints.material.uniforms.uTime.value = 0;
    siteOfGrace.corePoints.material.uniforms.uMotion.value = 0;
    siteOfGrace.corePoints.material.uniforms.uOpacity.value = GRACE_CORE_OPACITY;
    siteOfGrace.haloPoints.material.uniforms.uTime.value = 0;
    siteOfGrace.haloPoints.material.uniforms.uMotion.value = 0;
    siteOfGrace.haloPoints.material.uniforms.uOpacity.value = GRACE_HALO_OPACITY;
    siteOfGrace.dustPoints.material.uniforms.uTime.value = 0;
    siteOfGrace.dustPoints.material.uniforms.uMotion.value = 0;
    siteOfGrace.dustPoints.material.uniforms.uOpacity.value = GRACE_DUST_OPACITY;
    siteOfGrace.guidance.update(0, true, host.clientHeight * renderer.getPixelRatio());
    siteOfGrace.light.intensity = GRACE_LIGHT_INTENSITY;
    siteOfGrace.groundLight.intensity = GRACE_GROUND_LIGHT_INTENSITY;
    siteOfGrace.restApplied = true;
    return true;
}

function updateSiteOfGrace(now) {
    if (!siteOfGrace) return false;
    if (reducedMotion.matches) return applyGraceRestState();
    if (now - lastGraceFrameTime < GRACE_FRAME_INTERVAL) return false;

    lastGraceFrameTime = now;
    siteOfGrace.restApplied = false;
    const time = now * 0.001;
    const floatWave = (Math.sin(time * 1.45) + 0.45 * Math.sin(time * 2.63 + 1.1)) / 1.45;
    const lightWave = 0.62 * Math.sin(time * 2.05 + 0.35) + 0.38 * Math.sin(time * 4.31 + 1.7);

    siteOfGrace.group.position.y = GRACE_ANCHOR.y + floatWave * 0.008;
    siteOfGrace.corePoints.material.uniforms.uTime.value = time;
    siteOfGrace.corePoints.material.uniforms.uMotion.value = 1;
    siteOfGrace.corePoints.material.uniforms.uOpacity.value = GRACE_CORE_OPACITY + lightWave * 0.02;
    siteOfGrace.haloPoints.material.uniforms.uTime.value = time;
    siteOfGrace.haloPoints.material.uniforms.uMotion.value = 1;
    siteOfGrace.haloPoints.material.uniforms.uOpacity.value = GRACE_HALO_OPACITY + lightWave * 0.006;
    siteOfGrace.dustPoints.material.uniforms.uTime.value = time;
    siteOfGrace.dustPoints.material.uniforms.uMotion.value = 1;
    siteOfGrace.guidance.update(time, false, host.clientHeight * renderer.getPixelRatio());
    siteOfGrace.light.intensity = GRACE_LIGHT_INTENSITY * (1 + lightWave * 0.08);
    siteOfGrace.groundLight.intensity = GRACE_GROUND_LIGHT_INTENSITY * (1 + lightWave * 0.06);
    return true;
}

function fitCamera() {
    if (!view.modelSize) {
        camera.aspect = host.clientWidth / host.clientHeight;
        camera.updateProjectionMatrix();
        camera.position.set(0, cameraTarget.y, view.distance);
        return;
    }

    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const heightDistance = view.modelSize.y / (2 * Math.tan(verticalFov / 2));
    const widthDistance = view.modelSize.x / (2 * Math.tan(horizontalFov / 2));
    const fitDistance = Math.max(heightDistance, widthDistance) + view.modelSize.z * 0.58;

    view.distance = fitDistance * 1.12;

    camera.position.set(0, cameraTarget.y, view.distance);
    camera.lookAt(cameraTarget);
}

function normalizeModel(model) {
    const initialBounds = new THREE.Box3().setFromObject(model);
    const initialSize = initialBounds.getSize(new THREE.Vector3());
    const initialCenter = initialBounds.getCenter(new THREE.Vector3());
    const scale = Math.min(
        6.5 / Math.max(initialSize.y, 0.001),
        6.6 / Math.max(initialSize.x, 0.001),
        6.6 / Math.max(initialSize.z, 0.001)
    );

    model.scale.setScalar(scale);
    model.position.set(
        -initialCenter.x * scale,
        -initialBounds.min.y * scale,
        -initialCenter.z * scale
    );
    model.updateMatrixWorld(true);

    const normalizedBounds = new THREE.Box3().setFromObject(model);
    view.modelSize = normalizedBounds.getSize(new THREE.Vector3());
    cameraTarget.set(0, view.modelSize.y * 0.5, 0);
    normalizedBounds.getBoundingSphere(localInteractionSphere);

    model.traverse((object) => {
        if (!object.isMesh) return;
        object.frustumCulled = true;

        const geometryMeshes = meshesByGeometry.get(object.geometry) || [];
        geometryMeshes.push(object);
        meshesByGeometry.set(object.geometry, geometryMeshes);

        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            if ("roughness" in material) material.roughness = Math.max(material.roughness, 0.66);
        }
    });
}

async function buildRaycastIndex() {
    const geometries = [...meshesByGeometry.keys()].sort((first, second) => {
        return triangleCount(first) - triangleCount(second);
    });
    let worker = null;

    try {
        const { acceleratedRaycast, MeshBVH } = await import("three-mesh-bvh");
        THREE.Mesh.prototype.raycast = acceleratedRaycast;
        worker = new Worker(new URL("/transition/mind/mind-bvh-worker.js", location.origin), { type: "module" });

        for (const geometry of geometries) {
            const serialized = await generateBoundsTree(worker, geometry);
            const boundsTree = MeshBVH.deserialize(serialized, geometry, { setIndex: false });
            geometry.boundsTree = boundsTree;
            interactiveMeshes.push(...meshesByGeometry.get(geometry));
            lastPickTime = 0;
        }
    } catch (error) {
        // Never fall back to synchronous raycasts over 2.3 million triangles.
        // Rotation and the cabinet remain usable even if workers are blocked.
        interactiveMeshes.length = 0;
        console.warn("Tree surface indexing is unavailable; surface picking is disabled.", error);
    } finally {
        if (worker) worker.terminate();
        host.dataset.raycastReady = interactiveMeshes.length ? "true" : "failed";
        sceneNeedsRender = true;
        if (pickingPoint) pickerMessage.textContent = interactiveMeshes.length ? ''
            : '树表面准备失败，请刷新后重试。';
    }
    if (treeVeins && geometries.every(geometry => geometry.boundsTree)) {
        try {
            await treeVeins.build(interactiveMeshes);
            sceneNeedsRender = true;
        } catch (error) {
            console.warn('Tree vein surface sampling is unavailable:', error);
        }
    }
}

function triangleCount(geometry) {
    const count = geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
    return count / 3;
}

function loadTree() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const onLoaded = (gltf) => {
            treeModel = gltf.scene;
            normalizeModel(treeModel);
            treePivot.add(treeModel);
            treeVeins = createTreeVeins(treePivot);
            fitCamera();
            host.classList.add("is-ready");
            sceneStatus.hidden = true;
            scene.updateMatrixWorld(true);
            thoughtLeaves.faceCamera(camera, null);
            if (!cabinetOpen) renderer.render(scene, camera);
            sceneNeedsRender = true;

            // Present the tree before optional glow and geometry indexing.
            requestAnimationFrame(() => {
                try {
                    createSiteOfGrace();
                    treeAtmosphere = createTreeAtmosphere(tiltRoot, view.modelSize, host.clientHeight * renderer.getPixelRatio());
                    sceneNeedsRender = true;
                } catch (error) {
                    console.error("Site of grace failed to initialize:", error);
                }
                entryJourney?.ready();
                if (entryJourney?.active) entryJourney.finished.then(scheduleRaycastIndexBuild);
                else scheduleRaycastIndexBuild();
            });
        };
    const onProgress = (event) => {
            entryJourney?.progress(event);
            sceneStatus.textContent = event.lengthComputable && event.total > 0
                ? event.loaded >= event.total ? '正在展开树枝…' : `正在载入思维树 ${Math.round(event.loaded / event.total * 100)}%`
                : '正在载入思维树…';
        };
    const onError = (error) => {
            entryJourney?.fail();
            sceneStatus.textContent = '树模型加载失败，请刷新页面重试。';
            console.error("Tree model failed to load:", error);
    };
    const optimized = window.BLACKDOOR_ASSETS?.treeModel;
    if (optimized) {
        fetchTreeModelParts(optimized,onProgress)
            .then(buffer => loader.parseAsync(buffer,'/assets/models/'))
            .then(onLoaded)
            .catch(() => {
                sceneStatus.textContent = '正在使用兼容模型载入…';
                loader.load(MODEL_URL,onLoaded,onProgress,onError);
            });
    } else loader.load(MODEL_URL,onLoaded,onProgress,onError);
}

function scheduleRaycastIndexBuild() {
    const startBuild = () => buildRaycastIndex();

    window.setTimeout(() => {
        if ("requestIdleCallback" in window) {
            window.requestIdleCallback(startBuild, { timeout: 2500 });
        } else {
            startBuild();
        }
    }, 750);
}

function setPointerRay(x, y) {
    const rect = host.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false;
    pointerNdc.set(
        ((x - rect.left) / rect.width) * 2 - 1,
        -((y - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointerNdc, camera);
    return true;
}

function pickTreeSurface() {
    if (!interactiveMeshes.length) return null;
    worldInteractionSphere.copy(localInteractionSphere);
    worldInteractionSphere.applyMatrix4(treePivot.matrixWorld);
    if (!raycaster.ray.intersectsSphere(worldInteractionSphere)) return null;
    return raycaster.intersectObjects(interactiveMeshes, false)[0] || null;
}

function updateCoordinates(now) {
    if (!treeModel || host.dataset.raycastReady !== 'true' || pointer.dragging
        || Math.abs(rotation.targetYaw - rotation.yaw) > 0.001 || Math.abs(rotation.velocityYaw) > 0.01
        || !pointer.hasMoved || now - lastPickTime < PICK_INTERVAL) return;
    lastPickTime = now;
    leafTooltip.hidden = true;
    if (!setPointerRay(pointer.actualX, pointer.actualY)) { clearCoordinates(); return; }
    const hit = pickTreeSurface();
    const leafHit = !pickingPoint && host.dataset.raycastReady === 'true'
        ? raycaster.intersectObjects(thoughtLeaves.meshes, false)[0] : null;
    if (leafHit && (!hit || leafHit.distance <= hit.distance + 0.025)) {
        clearCoordinates();
        leafTooltip.textContent = leafHit.object.userData.thought.name;
        leafTooltip.hidden = false;
        leafTooltip.style.left = `${Math.max(8, Math.min(pointer.actualX + 18, window.innerWidth - leafTooltip.offsetWidth - 12))}px`;
        leafTooltip.style.top = `${Math.max(8, Math.min(pointer.actualY + 18, window.innerHeight - leafTooltip.offsetHeight - 12))}px`;
        return;
    }
    if (!hit) { clearCoordinates(); return; }

    coordinatePoint.copy(worldToTreePoint(treePivot, hit.point));
    const coordinateText = [coordinatePoint.x, coordinatePoint.y, coordinatePoint.z]
        .map(formatCoordinate)
        .join(", ");

    if (coordinateText === displayedCoordinates) return;
    displayedCoordinates = coordinateText;
    coordinatesElement.value = coordinateText;
    coordinatesElement.textContent = coordinateText;
    cursorElement.classList.add("has-coordinates");
}

function formatCoordinate(value) {
    return (Math.abs(value) < 0.005 ? 0 : value).toFixed(2);
}

function clearCoordinates() {
    if (!displayedCoordinates && !cursorElement.classList.contains("has-coordinates")) return;
    displayedCoordinates = "";
    cursorElement.classList.remove("has-coordinates");
    coordinatesElement.value = "";
    coordinatesElement.textContent = "";
}

function positionCursor(x, y) {
    cursorElement.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
}

function onPointerDown(event) {
    if (cabinetOpen || event.button !== 0 || !event.isPrimary) return;
    pointer.dragging = true;
    pointer.pointerId = event.pointerId;
    pointer.actualX = event.clientX;
    pointer.actualY = event.clientY;
    positionCursor(event.clientX, event.clientY);
    pointer.previousX = event.clientX;
    pointer.previousY = event.clientY;
    pointer.previousTime = performance.now();
    pointer.downX = event.clientX;
    pointer.downY = event.clientY;
    pointer.moved = false;
    pointer.startedOnGrace = Boolean(event.target.closest('#graceEntrance'));
    rotation.velocityYaw = 0;
    cursorElement.classList.add("is-dragging");
    clearCoordinates();
    leafTooltip.hidden = true;
    host.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
    pointer.actualX = event.clientX;
    pointer.actualY = event.clientY;
    pointer.hasMoved = true;
    positionCursor(event.clientX, event.clientY);

    if (!pointer.dragging || event.pointerId !== pointer.pointerId) return;
    pointer.moved ||= Math.hypot(event.clientX - pointer.downX, event.clientY - pointer.downY) > 6;
    if (!pointer.moved) return;

    const now = performance.now();
    const deltaX = event.clientX - pointer.previousX;
    const deltaTime = Math.max((now - pointer.previousTime) / 1000, 1 / 120);

    rotation.targetYaw += deltaX * ROTATION_SENSITIVITY;
    rotation.velocityYaw = THREE.MathUtils.clamp(deltaX * ROTATION_SENSITIVITY / deltaTime, -4, 4);

    pointer.previousX = event.clientX;
    pointer.previousY = event.clientY;
    pointer.previousTime = now;
}

function finishDrag(event) {
    if (!pointer.dragging || event.pointerId !== pointer.pointerId) return;
    pointer.dragging = false;
    pointer.pointerId = null;
    pointer.actualX = event.clientX;
    pointer.actualY = event.clientY;
    positionCursor(event.clientX, event.clientY);
    cursorElement.classList.remove("is-dragging");
    lastPickTime = 0;
    pointer.moved ||= Math.hypot(event.clientX - pointer.downX, event.clientY - pointer.downY) > 6;
    if (!pointer.moved) rotation.velocityYaw = 0;
    if (event.type !== 'pointerup' || pointer.moved) return;
    if (pickingPoint) {
        if (host.dataset.raycastReady !== 'true') {
            pickerMessage.textContent = host.dataset.raycastReady === 'failed'
                ? '树表面准备失败，请刷新后重试。' : '树表面仍在准备中，请稍候再点击。';
            return;
        }
        scene.updateMatrixWorld(true);
        if (!setPointerRay(event.clientX, event.clientY)) return;
        const hit = pickTreeSurface();
        if (!hit) { pickerMessage.textContent = '这里没有树表面，请点击树干或树枝。'; return; }
        const point = worldToTreePoint(treePivot, hit.point);
        enterCabinet();
        cabinet.setPosition(point);
    } else if (pointer.startedOnGrace) {
        const bounds = graceEntrance.getBoundingClientRect();
        if (event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom) enterCabinet();
    }
}

function onResize() {
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    treeAtmosphere?.resize(host.clientHeight * renderer.getPixelRatio());
    if (siteOfGrace) {
        const pixelRatio = renderer.getPixelRatio();
        siteOfGrace.corePoints.material.uniforms.uPixelRatio.value = pixelRatio;
        siteOfGrace.haloPoints.material.uniforms.uPixelRatio.value = pixelRatio;
        siteOfGrace.dustPoints.material.uniforms.uPixelRatio.value = pixelRatio;
        siteOfGrace.guidance.update(performance.now() * 0.001, reducedMotion.matches, host.clientHeight * pixelRatio);
    }
    fitCamera();
    sceneNeedsRender = true;
    pointer.actualX = THREE.MathUtils.clamp(pointer.actualX, 0, window.innerWidth);
    pointer.actualY = THREE.MathUtils.clamp(pointer.actualY, 0, window.innerHeight);
}

function animate(now) {
    animationFrameId = null;
    if (cabinetOpen || document.hidden) return;
    const deltaTime = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;

    // The tree is already loaded underneath the journey; spend the frame budget
    // on the flight until the overlay hands rendering back to this scene.
    if (entryJourney?.active) { requestSceneFrame(); return; }

    if (updateSiteOfGrace(now)) sceneNeedsRender = true;
    if (treeVeins?.update(now, reducedMotion.matches)) sceneNeedsRender = true;
    if (treeAtmosphere?.update(now, reducedMotion.matches)) sceneNeedsRender = true;

    if (!pointer.dragging) {
        rotation.targetYaw += rotation.velocityYaw * deltaTime;
        rotation.velocityYaw *= Math.exp(-5.2 * deltaTime);
    }

    const rotationBlend = 1 - Math.exp(-13 * deltaTime);
    const nextYaw = rotation.yaw + (rotation.targetYaw - rotation.yaw) * rotationBlend;
    const rotationChanged = Math.abs(nextYaw - rotation.yaw) > 0.00001;
    rotation.yaw = nextYaw;

    if (rotationChanged) {
        treePivot.rotation.y = rotation.yaw;
        if (siteOfGrace) siteOfGrace.facingRoot.rotation.y = -rotation.yaw;
        sceneNeedsRender = true;
    }

    if (sceneNeedsRender) {
        scene.updateMatrixWorld(true);
        thoughtLeaves.faceCamera(camera, host.dataset.raycastReady === 'true' ? interactiveMeshes : null);
        scene.updateMatrixWorld(true);
        positionGraceEntrance();
    }
    updateCoordinates(now);
    if (sceneNeedsRender) {
        renderer.render(scene, camera);
        sceneNeedsRender = false;
    }
    requestSceneFrame();
}

host.addEventListener("pointerdown", onPointerDown);
host.addEventListener("pointermove", onPointerMove, { passive: true });
host.addEventListener("pointerup", finishDrag, { passive: true });
host.addEventListener("pointercancel", finishDrag, { passive: true });
host.addEventListener('lostpointercapture', event => {
    if (pointer.dragging && pointer.pointerId === event.pointerId) {
        pointer.dragging = false;
        pointer.pointerId = null;
        rotation.velocityYaw = 0;
        cursorElement.classList.remove('is-dragging');
    }
});
host.addEventListener('pointerleave', () => {
    if (pointer.dragging) return;
    pointer.hasMoved = false;
    clearCoordinates();
    leafTooltip.hidden = true;
    cursorElement.style.opacity = '0';
});
host.addEventListener('pointerenter', () => { cursorElement.style.opacity = ''; });
graceEntrance.addEventListener('click', event => { if (event.detail === 0 && !pickingPoint) enterCabinet(); });
document.getElementById('cancelPick').addEventListener('click', enterCabinet);
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        if (pickingPoint) enterCabinet();
        else if (cabinetOpen) leaveCabinet();
    }
});
window.addEventListener('hashchange', () => setCabinetOpen(location.hash === '#cabinet'));
window.addEventListener("resize", onResize, { passive: true });
new ResizeObserver(onResize).observe(host);
document.addEventListener("visibilitychange", () => {
    lastFrameTime = performance.now();
    lastGraceFrameTime = 0;
    if (document.hidden) {
        if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        pointer.dragging = false;
        cursorElement.classList.remove('is-dragging');
        rotation.velocityYaw = 0;
        leafTooltip.hidden = true;
    } else { requestSceneFrame(); }
});

function onReducedMotionChange() {
    if (siteOfGrace) siteOfGrace.restApplied = false;
    lastGraceFrameTime = 0;
    sceneNeedsRender = true;
}

if (typeof reducedMotion.addEventListener === "function") {
    reducedMotion.addEventListener("change", onReducedMotionChange);
} else {
    reducedMotion.addListener(onReducedMotionChange);
}

const cabinet = createCabinet({
    onRecords(records) {
        thoughtLeaves.sync(records);
        sceneNeedsRender = true;
        requestSceneFrame();
    },
    onReturn: leaveCabinet,
    onPick: beginPointPick
});
if (location.hash === '#cabinet') setCabinetOpen(true);
fitCamera();
const entryJourney = createMindJourney({ onFinish() {
    lastFrameTime = performance.now();
    sceneNeedsRender = true;
    requestSceneFrame();
} });
loadTree();
requestSceneFrame();
