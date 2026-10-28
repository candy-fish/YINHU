(() => {
    'use strict';

    const container = document.querySelector('.blood-mist');
    const canvas = container.querySelector('.mist-volume');
    const context = canvas.getContext('2d');
    if (!context) return; // The existing CSS mist remains available without Canvas.

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const veil = createVeil();
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 256;
    const brush = sprite.getContext('2d');
    if (!brush) return;

    // Soft, lit wisps form a reusable volume slice; no textures or new downloads.
    for (let i = 0; i < 28; i++) {
        const angle = i * 2.39996;
        const distance = Math.sqrt(i / 28) * 59;
        const x = 128 + Math.cos(angle) * distance;
        const y = 128 + Math.sin(angle) * distance * .65;
        const radius = 32 + (i % 5) * 8;
        const glow = brush.createRadialGradient(x - 9, y - 12, 0, x, y, radius);
        glow.addColorStop(0, 'rgba(175, 32, 65, .26)');
        glow.addColorStop(.4, 'rgba(110, 12, 43, .18)');
        glow.addColorStop(.75, 'rgba(76, 6, 30, .055)');
        glow.addColorStop(1, 'rgba(55, 3, 20, 0)');
        brush.fillStyle = glow;
        brush.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    const clouds = Array.from({ length: 18 }, (_, index) => ({
        x: (index % 6 - 2.5) * .9 + Math.random() * .3,
        y: (Math.floor(index / 6) - 1) * 1.05 + Math.random() * .3,
        z: .2 + Math.random() * 2.7,
        radius: .65 + Math.random() * .5,
        phase: Math.random() * Math.PI * 2,
        spin: (Math.random() - .5) * .035
    }));
    let frame = 0;
    let lastFrame = 0;
    let lastDraw = 0;
    let clock = 0;
    let width = 1;
    let height = 1;
    let mobile = false;

    function resize() {
        mobile = innerWidth <= 600;
        // Fog has no sharp details: cap its pixel budget instead of using device DPR.
        const budget = veil ? (mobile ? 90000 : 160000) : (mobile ? 140000 : 280000);
        const scale = Math.min(1, Math.sqrt(budget / (innerWidth * innerHeight)));
        width = canvas.width = Math.max(1, Math.round(innerWidth * scale));
        height = canvas.height = Math.max(1, Math.round(innerHeight * scale));
        if (document.body.dataset.cardEffect) draw();
    }

    function draw() {
        context.clearRect(0, 0, width, height);
        if (veil?.draw(width, height, clock, document.body.dataset.cardEffect === 'scepter')) {
            context.drawImage(veil.canvas, 0, 0, width, height);
            canvas.dataset.renderer = 'flow-field';
            return;
        }
        canvas.dataset.renderer = 'soft-clouds';
        const depth = clouds.map(cloud => ({
            cloud,
            z: cloud.z + Math.sin(clock * .055 + cloud.phase) * .2
        })).sort((a, b) => b.z - a.z);
        const focal = Math.min(width, height) * 1.1;
        const cameraX = Math.sin(clock * .04) * .12;
        const cameraY = Math.cos(clock * .035) * .08;

        for (const { cloud, z } of depth) {
            // Perspective projection gives nearby banks larger shapes and faster parallax.
            const perspective = 1 / (1 + z * .62);
            const x = cloud.x + Math.sin(clock * .13 + cloud.phase) * .48 - cameraX;
            const y = cloud.y + Math.cos(clock * .11 + cloud.phase) * .24 - cameraY;
            const size = cloud.radius * focal * perspective * 2.6;
            context.save();
            context.translate(width / 2 + x * focal * perspective, height / 2 + y * focal * perspective);
            context.rotate(cloud.phase + clock * cloud.spin);
            context.globalAlpha = .6 + perspective * .3;
            context.drawImage(sprite, -size / 2, -size * .32, size, size * .64);
            context.restore();
        }
    }

    function tick(now) {
        frame = 0;
        clock += lastFrame ? Math.min((now - lastFrame) / 1000, .15) : 0;
        lastFrame = now;
        if (now - lastDraw >= 1000 / (mobile ? 18 : veil ? 22 : 24)) {
            draw();
            lastDraw = now;
        }
        frame = requestAnimationFrame(tick);
    }

    function update() {
        cancelAnimationFrame(frame);
        frame = 0;
        lastFrame = lastDraw = 0;
        if (!document.body.dataset.cardEffect) {
            context.clearRect(0, 0, width, height);
            return;
        }
        // Paint immediately on selection; only the existing volume drifts afterwards.
        draw();
        if (!document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(tick);
    }

    container.classList.add('is-volume-ready');
    document.addEventListener('counter:effect', update);
    document.addEventListener('visibilitychange', update);
    reducedMotion.addEventListener('change', update);
    window.addEventListener('resize', resize);
    window.addEventListener('pagehide', () => {
        cancelAnimationFrame(frame);
        frame = lastFrame = 0;
    });
    window.addEventListener('pageshow', update);
    resize();
    update();

    function createVeil() {
        // Three warped depth slices make long, curling wisps instead of round sprite banks.
        const surface = document.createElement('canvas');
        const gl = surface.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: false });
        if (!gl) return null;
        const vertex = `
            attribute vec2 position;
            void main() { gl_Position = vec4(position, 0.0, 1.0); }
        `;
        const fragment = `
            precision highp float;
            uniform vec2 resolution;
            uniform float time;
            uniform float intensity;

            float hash(vec2 p) {
                vec3 q = fract(vec3(p.xyx) * .1031);
                q += dot(q, q.yzx + 33.33);
                return fract((q.x + q.y) * q.z);
            }
            float noise(vec2 p) {
                vec2 i = floor(p), f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
            }
            float fbm(vec2 p) {
                float value = .56 * noise(p);
                p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3;
                value += .28 * noise(p);
                p = mat2(1.6, 1.2, -1.2, 1.6) * p + 4.7;
                return value + .16 * noise(p);
            }
            void main() {
                vec2 uv = gl_FragCoord.xy / resolution;
                vec2 screen = (uv - .5) * vec2(resolution.x / resolution.y, 1.0);
                float t = time * .055;
                vec4 volume = vec4(0.0);
                for (int i = 0; i < 3; i++) {
                    float depth = float(i);
                    vec2 p = screen * (3.6 + depth * .85);
                    p += vec2(t * (.18 + depth * .12), t * (.45 + depth * .16));
                    p += vec2(depth * 13.1, depth * 7.4);
                    vec2 curl = vec2(fbm(p * .83 + vec2(0.0, t)),
                        fbm(p * .83 + vec2(5.2, 1.3 - t * .7)));
                    float smoke = fbm(p + curl * 3.4);
                    float thread = fbm(p * vec2(2.3, .36) + curl * vec2(3.8, 1.3));
                    float density = smoke * .55 + thread * .45;
                    float ridge = pow(1.0 - smoothstep(.018, .070, abs(density - .55)), 1.4);
                    float body = smoothstep(.49, .70, density);
                    vec3 shadow = vec3(.055, .002, .009);
                    vec3 scarlet = vec3(.88, .022, .038);
                    vec3 color = mix(shadow, scarlet, clamp(ridge * .86 + body * .18, 0.0, 1.0));
                    float alpha = (body * .62 + ridge * .62) * intensity / (1.0 + depth * .8);
                    volume.rgb += (1.0 - volume.a) * color * alpha;
                    volume.a += (1.0 - volume.a) * alpha;
                }
                gl_FragColor = vec4(volume.rgb / max(volume.a, .001), volume.a);
            }
        `;
        const shaders = [];
        let program;
        let buffer;
        try {
            for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
                const shader = gl.createShader(type);
                shaders.push(shader);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Mist shader unavailable');
            }
            program = gl.createProgram();
            for (const shader of shaders) gl.attachShader(program, shader);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Mist renderer unavailable');
            gl.useProgram(program);
            buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const position = gl.getAttribLocation(program, 'position');
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            const size = gl.getUniformLocation(program, 'resolution');
            const clock = gl.getUniformLocation(program, 'time');
            const strength = gl.getUniformLocation(program, 'intensity');
            return {
                canvas: surface,
                draw(w, h, elapsed, deep) {
                    if (gl.isContextLost()) return false;
                    if (surface.width !== w || surface.height !== h) { surface.width = w; surface.height = h; }
                    gl.viewport(0, 0, w, h);
                    gl.uniform2f(size, w, h);
                    gl.uniform1f(clock, elapsed);
                    gl.uniform1f(strength, deep ? .98 : .72);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                    return true;
                }
            };
        } catch {
            if (buffer) gl.deleteBuffer(buffer);
            if (program) gl.deleteProgram(program);
            return null;
        } finally {
            for (const shader of shaders) gl.deleteShader(shader);
        }
    }
})();
