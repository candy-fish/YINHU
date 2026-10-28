import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const vertexShader = `
  #include <common>
  #include <morphtarget_pars_vertex>
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  uniform float uTime;
  uniform float uPhase;
  uniform float uForm;
  void main() {
    #include <morphinstance_vertex>
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    // Broad travelling folds alter the five Blender silhouettes independently.
    // X remains monotonic: there are no doubled-back seams or broken joints.
    float along = uv.x;
    float up = 1.0 - uv.y;
    float ends = pow(sin(along * 3.14159265), 2.0);
    float sweep = sin(along * (4.0 + uForm * .85) - uTime * .16 + uPhase);
    float curl = sin(along * 9.0 + uTime * .11 + uPhase * 1.7);
    transformed.y += ends * (sweep * (.32 + uForm * .065) + curl * .10) * (1.0 - up * .25);
    transformed.z += ends * sin(along * 6.0 - uTime * .13 + uPhase) * (.24 + up * .22);
    #include <project_vertex>
    // glTF stores V downwards; the Blender curtain coordinates grow upwards.
    vUv = vec2(uv.x, 1.0 - uv.y);
    vNormal = transformedNormal;
    vView = -mvPosition.xyz;
  }
`;
const fragmentShader = `
  uniform sampler2D uStrands;
  uniform vec3 uTint;
  uniform float uTime;
  uniform float uPhase;
  uniform float uStrength;
  uniform float uForm;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  uniform float uEnd;
  void main() {
    // Along-curtain waves and rising rays have different speeds. Patches of
    // emission travel through the folds instead of sliding one uniform sheet.
    vec2 flow = vec2(vUv.x * (1.55 + uForm * .11) - uTime * (.009 + uForm * .001) + uPhase * .1,
      vUv.y * .65 - uTime * (.032 + uForm * .003));
    float cloud = texture2D(uStrands, flow * vec2(.64, 1.0) + uPhase * .13).g;
    flow.x += (.018 * sin(vUv.y * 5.0 - uTime * .14 + uPhase) + (cloud - .5) * .035) * vUv.y;
    float strands = texture2D(uStrands, flow).r * .5;
    strands += texture2D(uStrands, flow + vec2(.0018, 0.0)).r * .25;
    strands += texture2D(uStrands, flow - vec2(.0018, 0.0)).r * .25;
    float profile = texture2D(uStrands, vec2(vUv.x * .65 - uTime * .008 + uPhase * .16, .2)).b;
    float lift = .025 + .10 * profile;
    float rayHeight = .28 + .66 * profile;
    float heightFade = pow(1.0 - smoothstep(lift + .02, rayHeight, vUv.y), 1.5);
    float lowerGlow = exp(-pow((vUv.y - lift) / (.045 + cloud * .065), 2.0));
    float ends = smoothstep(0.0, .14, vUv.x) * (1.0 - smoothstep(uEnd - .14, uEnd, vUv.x));
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    float clusters = smoothstep(.14, .82, cloud);
    float surge = .78 + .22 * sin(vUv.x * 8.0 - uTime * .32 + uPhase);
    float density = lowerGlow * (.16 + cloud * .34) * clusters;
    density += (.11 * cloud + .30 * pow(strands, 2.1) * clusters) * heightFade;
    density += rim * .02 * heightFade * clusters;
    density *= smoothstep(0.0, .045, vUv.y);
    vec3 chroma = pow(uTint / max(max(uTint.r, uTint.g), uTint.b), vec3(2.6));
    vec3 color = mix(chroma, uTint, .38) * (.88 + lowerGlow * .12);
    float alpha = min(.72, density * ends * surge * 1.65 * uStrength);
    // The transparent canvas is premultiplied. Additive alpha squared the
    // coverage and washed pastel RGB to white during browser compositing.
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

function makeStrands() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d'); const pixels = ctx.createImageData(canvas.width, canvas.height);
  const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7 + 61913) * 43758.5453; return n - Math.floor(n); };
  const noise = (x, y, periodX, periodY) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => hash(((i % periodX) + periodX) % periodX, ((j % periodY) + periodY) % periodY);
    const a = at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx;
    const b = at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx;
    return a * (1 - sy) + b * sy;
  };
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const u = x / canvas.width, v = y / canvas.height;
    const streak = noise(u * 170 + .4 * Math.sin(v * Math.PI * 2), v * 2, 170, 2) * .70 + noise(u * 46, v * 2, 46, 2) * .30;
    const cloud = noise(u * 8, v * 4, 8, 4) * .68 + noise(u * 21 + 7, v * 11, 21, 11) * .32;
    const index = (y * canvas.width + x) * 4;
    pixels.data[index] = Math.round(streak * 255);
    pixels.data[index + 1] = Math.round(cloud * 255);
    pixels.data[index + 2] = Math.round(noise(u * 5 + 17, 2, 5, 1) * 255);
    pixels.data[index + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export async function createAuroraScene(canvas, reducedMotion) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25) * .65);
  const scene = new THREE.Scene();
  const model = await new GLTFLoader().loadAsync(new URL('./aurora-curtains.glb', import.meta.url).href);
  scene.add(model.scene);
  const camera = new THREE.OrthographicCamera(-13, 13, 4, -4, .1, 100);
  camera.position.set(0, 10, 25); camera.lookAt(0, 3.8, 0);
  const texture = makeStrands(), curtains = [], originals = new Set();
  model.scene.traverse(object => {
    if (!object.isMesh) return;
    originals.add(object.material);
    const tint = object.userData.auroraTint || '#BBD7E5';
    const rgb = [1, 3, 5].map(index => parseInt(tint.slice(index, index + 2), 16) / 255);
    const phase = Number(object.userData.auroraPhase || 0);
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader,
      uniforms: { uStrands: { value: texture }, uTint: { value: new THREE.Vector3(...rgb) }, uTime: { value: 0 }, uPhase: { value: phase },
        uForm: { value: curtains.length }, uEnd: { value: 1 }, uStrength: { value: object.userData.auroraStrength ?? 1 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      premultipliedAlpha: true, blending: THREE.NormalBlending
    });
    object.material = material; object.frustumCulled = false; curtains.push({ object, material, phase });
  });
  originals.forEach(material => material.dispose());
  if (curtains.length !== 5) throw new Error('The Blender aurora needs its five independent curtains.');

  // Two shorter, distant folds interrupt the broad arcs. Reuse the Blender
  // surfaces, but give each instance its own proportion, depth and flow phase.
  const wisps = [
    // Replace the central ice-blue fold with the requested lower-right sweep.
    // Fade before the source curve turns back upward, keeping a descending tail.
    { source: 0, scale: [.60, .66, 1], position: [16.5, 1.0, -1.5], strength: .50, phase: 3.7, end: .62 },
    { source: 1, scale: [.36, .68, 1], position: [-9, 1.7, -2], strength: .32, phase: 5.6 }
  ];
  for (const spec of wisps) {
    const object = curtains[spec.source].object.clone();
    const material = object.material.clone(); object.material = material;
    object.scale.set(...spec.scale); object.position.add(new THREE.Vector3(...spec.position));
    material.uniforms.uStrength.value = spec.strength;
    material.uniforms.uPhase.value = spec.phase;
    material.uniforms.uForm.value = spec.source + 1.5;
    material.uniforms.uEnd.value = spec.end ?? 1;
    curtains[spec.source].object.parent.add(object);
    curtains.push({ object, material, phase: spec.phase });
  }

  // The shared crisp 2D star field sits behind this soft curtain canvas.
  let previous = -Infinity, dirty = true;
  function resize() {
    const rect = canvas.getBoundingClientRect(), aspect = Math.max(.5, rect.width / Math.max(1, rect.height));
    const width = Math.max(5.5, Math.min(13, aspect * 3.6));
    camera.left = -width; camera.right = width; camera.top = width / aspect; camera.bottom = -width / aspect;
    camera.updateProjectionMatrix(); renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false); dirty = true;
  }
  window.addEventListener('resize', resize, { passive: true });
  reducedMotion.addEventListener('change', () => { dirty = true; });
  renderer.domElement.addEventListener('webglcontextrestored', () => { dirty = true; });
  resize(); renderer.compile(scene, camera); renderer.render(scene, camera);
  canvas.dataset.renderer = 'blender-aurora-3d'; canvas.dataset.curtains = String(curtains.length);
  return { draw(time) {
    if (!dirty && (reducedMotion.matches || time - previous < 66)) return;
    previous = time; dirty = false;
    const seconds = reducedMotion.matches ? 0 : time / 1000;
    for (const { object, material, phase } of curtains) {
      material.uniforms.uTime.value = seconds;
      for (const [name, amount] of [['Flow A', .62], ['Flow B', .34]]) {
        const index = object.morphTargetDictionary?.[name];
        if (index !== undefined) object.morphTargetInfluences[index] = reducedMotion.matches ? 0 : (.5 + .5 * Math.sin(seconds * .19 + phase + (name === 'Flow B' ? 2.1 : 0))) * amount;
      }
    }
    renderer.render(scene, camera);
  } };
}
