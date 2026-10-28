import { createNightStars } from './night-stars.js';

// An original curtain field: luminous lower folds, fine vertical rays, and diffuse tops.
// Uses the existing page clock at 12 fps, with a small drawing buffer and no new RAF.
const vertexSource = `
  attribute vec2 aPosition;
  void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;
const fragmentSource = `
  precision highp float;
  uniform vec2 uResolution;
  uniform float uTime;

  float hash(float p) { return fract(sin(p * 127.1) * 43758.5453); }
  float noise(float p) {
    float i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(hash(i), hash(i + 1.0), f);
  }
  float field(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i.x + i.y * 157.0), hash(i.x + 1.0 + i.y * 157.0), f.x),
      mix(hash(i.x + (i.y + 1.0) * 157.0), hash(i.x + 1.0 + (i.y + 1.0) * 157.0), f.x), f.y);
  }
  vec3 curtain(vec2 uv, float layer) {
    float t = uTime;
    float x = uv.x + .018 * sin(uv.y * 4.5 + t * .025 + layer * 1.1);
    float fold = .49 + layer * .15
      + .16 * sin(x * 5.3 - .7 + layer * .6 + t * .12)
      + .042 * sin(x * 12.0 - t * .09 + layer * 3.0);
    fold += .013 * noise(x * 39.0 + t * .035 + layer * 17.0);
    float d = fold - uv.y;
    float drift = x * 180.0 + t * .16 + layer * 37.0;
    float rays = .42 + .58 * pow(noise(drift + noise(x * 16.0) * 7.0), 1.4);
    rays *= .75 + .25 * noise(x * 430.0 + t * .27);
    float height = .28 + .26 * noise(x * 11.0 - t * .04 + layer * 7.0);
    float upperFade = 1.0 - smoothstep(height - .12, height + .12, d);
    float body = exp(-max(d, 0.0) * 5.0) * smoothstep(-.014, .014, d) * upperFade;
    float texture = .65 + .35 * field(vec2(x * 15.0 + t * .02, uv.y * 3.0));
    float core = exp(-abs(d) * 88.0) * (.2 + rays * .8);
    float halo = exp(-abs(d) * 13.0) * .22;
    float envelope = (.35 + .65 * smoothstep(.04, .65, uv.x))
      * (.35 + .65 * noise(x * 4.0 + layer * 5.0 + t * .012));
    vec3 cyan = vec3(.733, .843, .898);
    vec3 green = vec3(.733, .867, .773);
    vec3 tail = mix(green, cyan, smoothstep(.01, .32, max(d, 0.0)));
    vec3 emission = tail * body * (.25 + rays * .9) * texture * 1.4;
    emission += vec3(.922, .808, .898) * core * .65;
    emission += mix(cyan, green, .5) * halo;
    float violet = smoothstep(.26, .5, d) * body * rays;
    emission += vec3(.467, .443, .561) * violet * .25;
    return emission * envelope * mix(1.0, .28, layer);
  }
  void main() {
    vec2 uv = vec2(gl_FragCoord.x / uResolution.x, 1.0 - gl_FragCoord.y / uResolution.y);
    vec3 light = curtain(uv, 0.0) + curtain(uv, 1.0);
    light += vec3(.005, .018, .03) * (1.0 - uv.y);
    vec2 cell = floor(gl_FragCoord.xy / 8.0);
    float star = step(.995, hash(cell.x + cell.y * 211.0));
    vec2 point = fract(gl_FragCoord.xy / 8.0) - .5;
    light += vec3(.46, .7, .76) * star * exp(-dot(point, point) * 170.0) * .28;
    vec3 color = 1.0 - exp(-light * 1.35);
    color *= 1.0 - smoothstep(.72, 1.0, uv.y);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createAurora(canvas, reducedMotion) {
  const stars = createNightStars(document.getElementById('nightStars'), reducedMotion);
  let engine = null;
  canvas.dataset.renderer = 'loading-blender';
  import('./assets/companions-3d.bundle.js')
    .then(module => module.createAuroraScene(canvas, reducedMotion))
    .then(renderer => { engine = renderer; })
    .catch(error => {
      console.warn('Blender aurora unavailable; using the curtain fallback.', error);
      const fallback = canvas.cloneNode(false); canvas.replaceWith(fallback);
      try { engine = createCurtain(fallback, reducedMotion); }
      catch { fallback.dataset.renderer = 'unavailable'; }
    });
  return { draw(time) { stars.draw(time); engine?.draw(time); } };
}

function createCurtain(canvas, reducedMotion) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
  let previous = -Infinity, dirty = true;
  reducedMotion.addEventListener('change', () => { dirty = true; });
  window.addEventListener('resize', () => { dirty = true; }, { passive: true });
  if (!gl) {
    const ctx = canvas.getContext('2d');
    canvas.dataset.renderer = 'curtain-2d';
    return { draw(time) {
      if (!ctx || (!dirty && (reducedMotion.matches || time - previous < 60))) return;
      previous = time; dirty = false;
      const rect = canvas.getBoundingClientRect(); canvas.width = Math.max(1, Math.round(rect.width * .75)); canvas.height = Math.max(1, Math.round(rect.height * .75));
      const w = canvas.width, h = canvas.height, t = reducedMotion.matches ? 18 : time / 1000;
      ctx.clearRect(0, 0, w, h); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 280; i++) {
        const x = i / 279, base = (.5 + Math.sin(x * 5.3 - .7 + t * .027) * .16 + Math.sin(x * 15 + t * .04) * .052) * h;
        const strength = .12 + .3 * (Math.sin(i * 1.7) * .5 + .5);
        const gradient = ctx.createLinearGradient(0, base - h * .48, 0, base + 3);
        gradient.addColorStop(0, '#BBD7E500'); gradient.addColorStop(.55, `rgba(187,215,229,${strength * .4})`);
        gradient.addColorStop(.94, `rgba(187,221,197,${strength})`); gradient.addColorStop(1, '#EBCEE500');
        ctx.fillStyle = gradient; ctx.fillRect(x * w, base - h * .48, w / 200, h * .48 + 3);
      }
    } };
  }
  function compile(type, source) {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  let resolution, clock, ready = false;
  function initialize() {
    const vertex = compile(gl.VERTEX_SHADER, vertexSource), fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.deleteShader(vertex); gl.deleteShader(fragment); gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    resolution = gl.getUniformLocation(program, 'uResolution'); clock = gl.getUniformLocation(program, 'uTime'); ready = true;
    canvas.dataset.renderer = 'curtain-webgl';
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 1) * .5;
    canvas.width = Math.max(1, Math.min(720, Math.round(rect.width * ratio))); canvas.height = Math.max(1, Math.min(195, Math.round(rect.height * ratio)));
    gl.viewport(0, 0, canvas.width, canvas.height); dirty = true;
  }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); ready = false; canvas.dataset.renderer = 'context-lost'; });
  canvas.addEventListener('webglcontextrestored', () => {
    try { initialize(); resize(); }
    catch { ready = false; canvas.dataset.renderer = 'unavailable'; }
  });
  window.addEventListener('resize', resize, { passive: true });
  initialize(); resize();
  return { draw(time) {
    if (!ready || (!dirty && (reducedMotion.matches || time - previous < 83))) return;
    if (gl.isContextLost()) return;
    previous = time; dirty = false;
    gl.uniform2f(resolution, canvas.width, canvas.height); gl.uniform1f(clock, reducedMotion.matches ? 18 : time / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  } };
}
