import { Color, MathUtils, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Scene,
  SphereGeometry, SRGBColorSpace, TextureLoader, WebGLRenderer } from 'three';
import './travel-map.js';

const canvas = document.getElementById('earth');
const errorMessage = document.getElementById('loadError');

async function createGlobe() {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.background = new Color('#030507');
  const camera = new PerspectiveCamera(35, 1, .1, 100);
  // The bundled module lives beside the local NASA Black Marble texture.
  const loader = new TextureLoader();
  const [texture, lunarTexture] = await Promise.all([
    loader.loadAsync(new URL('./earth-night-2016.jpg', import.meta.url).href),
    loader.loadAsync(new URL('./lunar-foreground.png', import.meta.url).href)
  ]);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const geometry = new SphereGeometry(1, 128, 64);
  const material = new MeshBasicMaterial({ map: texture });
  const nightTime = { value: 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.uNightTime = nightTime;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNightTime;
        float cityPhase(vec2 cell) {
          return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453) * 6.2831853;
        }
      `)
      .replace('#include <map_fragment>', `#include <map_fragment>
        // Animate only bright, warm city lights; blue land and oceans stay steady.
        float brightness = max(diffuseColor.r, diffuseColor.g);
        float city = smoothstep(0.035, 0.22, brightness)
          * smoothstep(0.0, 0.06, diffuseColor.r - diffuseColor.b * 0.82);
        float phase = cityPhase(floor(vMapUv * vec2(720.0, 360.0)));
        float breathing = sin(uNightTime * 0.65 + phase) * 0.40
          + sin(uNightTime * 0.29 + phase * 1.7) * 0.18;
        float glint = pow(max(0.0, sin(uNightTime * 0.9 + phase)), 8.0) * 0.55;
        diffuseColor.rgb *= 1.0 + city * (breathing + glint);
      `);
  };
  const earth = new Mesh(geometry, material);
  earth.rotation.order = 'YXZ';
  earth.rotation.set(-.38, MathUtils.degToRad(165), 0);
  scene.add(earth);

  // Composite the fixed lunar foreground in the same WebGL frame as the globe.
  // Its transparent upper section preserves the low, gently curved horizon.
  lunarTexture.colorSpace = SRGBColorSpace;
  const foreground = new Scene();
  const foregroundCamera = new OrthographicCamera(-.5, .5, .5, -.5, .1, 10);
  foregroundCamera.position.z = 1;
  const lunarGeometry = new PlaneGeometry(1, .22);
  const lunarMaterial = new MeshBasicMaterial({ map: lunarTexture, color: '#a6a6a6',
    transparent: true, depthTest: false, depthWrite: false });
  const lunarSurface = new Mesh(lunarGeometry, lunarMaterial);
  lunarSurface.position.y = -.39;
  foreground.add(lunarSurface);

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let diameter = 1, pendingFrame = 0, drag = null, lastTime = null, lastPaint = -Infinity, disposed = false,
    mapOpen = document.getElementById('travelAtlas').open;
  function animate(time) {
    pendingFrame = 0;
    const dt = lastTime === null ? 0 : Math.min(.05, (time - lastTime) / 1000);
    lastTime = time;
    if (!reducedMotion.matches) {
      nightTime.value += dt;
      if (!drag) earth.rotation.y = MathUtils.euclideanModulo(earth.rotation.y + dt * .012, Math.PI * 2);
    }
    // Keep idle animation at 30 fps, while direct manipulation remains responsive.
    if (time - lastPaint >= 1000 / 30 || drag || reducedMotion.matches) {
      renderer.render(scene, camera);
      renderer.autoClear = false;
      renderer.render(foreground, foregroundCamera);
      renderer.autoClear = true;
      lastPaint = time;
    }
    if (!reducedMotion.matches) render();
  }
  function render() {
    if (pendingFrame || disposed || document.hidden || mapOpen) return;
    pendingFrame = requestAnimationFrame(animate);
  }
  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    diameter = Math.min(width * .76, height * .76, 900) * .512;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Fit the sphere's silhouette to the same fraction of either viewport dimension.
    camera.position.z = Math.sqrt(1 + (height / (diameter * Math.tan(MathUtils.degToRad(camera.fov / 2)))) ** 2);
    camera.updateProjectionMatrix();
    lastPaint = -Infinity;
    render();
  }
  function onEarth(event) {
    const rect = canvas.getBoundingClientRect();
    return Math.hypot(event.clientX - rect.left - rect.width / 2,
      event.clientY - rect.top - rect.height / 2) <= diameter / 2;
  }
  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || drag || !onEarth(event)) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, yaw: earth.rotation.y, diameter };
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag) { canvas.style.cursor = onEarth(event) ? 'grab' : 'default'; return; }
    if (event.pointerId !== drag.id) return;
    earth.rotation.y = drag.yaw + (event.clientX - drag.x) / drag.diameter * Math.PI;
    render();
  });
  function release(event) {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    earth.rotation.y = MathUtils.euclideanModulo(earth.rotation.y, Math.PI * 2);
    canvas.style.cursor = onEarth(event) ? 'grab' : 'default';
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, release);
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') earth.rotation.y -= .08;
    if (event.key === 'ArrowRight') earth.rotation.y += .08;
    render();
  });
  window.addEventListener('resize', resize);
  function suspend() {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = 0; lastTime = null;
  }
  document.addEventListener('travel-map-visibility', event => {
    mapOpen = event.detail; suspend(); if (!mapOpen) render();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend();
    else render();
  });
  reducedMotion.addEventListener('change', () => { suspend(); render(); });
  window.addEventListener('pageshow', () => { lastTime = null; render(); });
  window.addEventListener('pagehide', event => {
    suspend();
    if (event.persisted) return;
    disposed = true;
    texture.dispose(); geometry.dispose(); material.dispose();
    lunarTexture.dispose(); lunarGeometry.dispose(); lunarMaterial.dispose(); renderer.dispose();
  });
  resize();
  canvas.setAttribute('aria-busy', 'false');
}

createGlobe().catch(error => {
  console.error('Travel globe could not load:', error);
  canvas.setAttribute('aria-busy', 'false');
  canvas.hidden = true;
  errorMessage.hidden = false;
});
