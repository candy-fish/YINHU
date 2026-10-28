(() => {
    'use strict';

    const countOutput = document.getElementById('count');
    const button = document.getElementById('increment');
    const display = document.querySelector('.display');
    const panel = document.querySelector('.counter');
    const buttonWell = document.querySelector('.button-well');
    const glassSurface = document.querySelector('.glass-surface');
    const canvas = document.getElementById('confetti');
    const context = canvas.getContext('2d');
    const sharedCounter = globalThis.BlackDoorCounter;
    const syncStatus = document.getElementById('syncStatus');
    const perimeter = document.querySelector('.perimeter-light');
    const lightRuns = [...perimeter.querySelectorAll('.light-run')];
    const perimeterPath = perimeter.querySelector('path');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const colors = ['#ff9147', '#ffd478', '#f5ede0', '#86cfc2', '#91adf0', '#e99cb5'];
    const heartShape = new Path2D('M0 .43C-.13 .29-.53 .01-.47-.24C-.4-.54-.09-.51 0-.29C.09-.51.4-.54.47-.24C.53.01.13.29 0 .43Z');
    const flowerShape = new Path2D();
    for (let petal = 0; petal < 5; petal++) {
        const angle = -Math.PI / 2 + petal * Math.PI * 2 / 5;
        const x = Math.cos(angle) * .255;
        const y = Math.sin(angle) * .255;
        flowerShape.moveTo(x + .235, y);
        flowerShape.arc(x, y, .235, 0, Math.PI * 2);
    }
    const maxParticles = 1200;
    const launchLevels = [
        { height: .055, angle: .18 },
        { height: .48, angle: -.18 },
        { height: .945, angle: -.9 }
    ];
    const maxSparks = 160;
    const lapDuration = 2800;
    const lightSegments = [
        { offset: 0, length: .055, strength: 1, delay: 0 },
        { offset: 1 / 3, length: .04, strength: .8, delay: 180 },
        { offset: 2 / 3, length: .028, strength: .6, delay: 360 }
    ];
    let particles = [];
    let burstQueue = [];
    let sparks = [];
    let laps = [];
    let perimeterLength = 0;
    let frame = 0;
    let previousTime = 0;
    let width = 0;
    let height = 0;
    let pressTimer;
    let chargeTimer;
    let countAnimation;

    function fitCount() {
        // Fit long counts without changing the display or losing digits.
        const availableWidth = countOutput.clientWidth;
        const digits = countOutput.textContent.length;
        countOutput.style.setProperty('--count-size', `${Math.max(1, availableWidth / (digits * .64))}px`);
    }

    function updateGlassCutouts() {
        // Clip the glass itself so neither blur nor moving light covers the openings.
        const surface = glassSurface.getBoundingClientRect();
        const screen = display.getBoundingClientRect();
        const well = buttonWell.getBoundingClientRect();
        const x = screen.left - surface.left;
        const y = screen.top - surface.top;
        const right = x + screen.width;
        const bottom = y + screen.height;
        const radius = parseFloat(getComputedStyle(display).borderTopLeftRadius);
        const cx = well.left - surface.left + well.width / 2;
        const cy = well.top - surface.top + well.height / 2;
        const rx = well.width / 2;
        const ry = well.height / 2;
        const path = [
            `M0 0H${surface.width}V${surface.height}H0Z`,
            `M${x + radius} ${y}H${right - radius}Q${right} ${y} ${right} ${y + radius}`,
            `V${bottom - radius}Q${right} ${bottom} ${right - radius} ${bottom}`,
            `H${x + radius}Q${x} ${bottom} ${x} ${bottom - radius}`,
            `V${y + radius}Q${x} ${y} ${x + radius} ${y}Z`,
            `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`
        ].join(' ');
        glassSurface.style.clipPath = `path(evenodd, "${path}")`;
        glassSurface.style.visibility = 'visible';
    }

    function updatePerimeter() {
        const { width: w, height: h } = panel.getBoundingClientRect();
        const r = Math.max(1, parseFloat(getComputedStyle(panel).borderTopLeftRadius) - 1);
        // Start at the top center and trace the actual rounded frame clockwise.
        const path = `M${w / 2} 1H${w - r - 1}A${r} ${r} 0 0 1 ${w - 1} ${r + 1}` +
            `V${h - r - 1}A${r} ${r} 0 0 1 ${w - r - 1} ${h - 1}` +
            `H${r + 1}A${r} ${r} 0 0 1 1 ${h - r - 1}` +
            `V${r + 1}A${r} ${r} 0 0 1 ${r + 1} 1H${w / 2}Z`;
        perimeter.setAttribute('viewBox', `0 0 ${w} ${h}`);
        for (const stroke of perimeter.querySelectorAll('path')) stroke.setAttribute('d', path);
        perimeterLength = perimeterPath.getTotalLength();
    }

    function resizeCanvas() {
        width = window.innerWidth;
        height = window.innerHeight;
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        context?.setTransform(scale, 0, 0, scale, 0, 0);
    }

    function stopConfetti() {
        cancelAnimationFrame(frame);
        frame = 0;
        previousTime = 0;
        particles = [];
        burstQueue = [];
        sparks = [];
        laps = [];
        for (const run of lightRuns) run.style.opacity = '0';
        clearTimeout(chargeTimer);
        panel.classList.remove('is-charged');
        context?.clearRect(0, 0, width, height);
    }

    function emitSparks(point, rect) {
        const nx = point.x - rect.width / 2;
        const ny = point.y - rect.height / 2;
        const outward = Math.atan2(ny, nx);
        for (let i = 0; i < 2; i++) {
            const angle = outward + (Math.random() - .5) * 1.8;
            const speed = 35 + Math.random() * 100;
            sparks.push({
                x: rect.left + point.x, y: rect.top + point.y,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 18,
                age: 0, life: .22 + Math.random() * .25,
                size: .7 + Math.random() * 1.2,
                color: Math.random() > .6 ? '#fff1ba' : '#ffc34f'
            });
        }
        if (sparks.length > maxSparks) sparks.splice(0, sparks.length - maxSparks);
    }

    function drawPerimeter(time, elapsed, dt) {
        const rect = laps.length ? panel.getBoundingClientRect() : null;
        laps = laps.filter(lap => {
            if (time < lap.start) {
                lap.run.style.opacity = '0';
                return true;
            }
            const progress = Math.min(1, (time - lap.start) / lapDuration);
            if (progress >= 1) {
                lap.run.style.opacity = '0';
                return false;
            }
            const position = lap.offset + progress;
            lap.run.style.opacity = String(lap.strength * Math.min(1, progress / .035, (1 - progress) / .08));
            for (const stroke of lap.run.children) stroke.style.strokeDashoffset = String(lap.length - position);
            // Emit by elapsed time rather than frame count; cap catch-up work after a slow frame.
            if (time - lap.lastSpark >= 42) {
                emitSparks(perimeterPath.getPointAtLength((position % 1) * perimeterLength), rect);
                lap.lastSpark = time;
            }
            return true;
        });

        context.save();
        context.globalCompositeOperation = 'lighter';
        context.lineCap = 'round';
        sparks = sparks.filter(spark => {
            spark.age += elapsed;
            if (spark.age >= spark.life) return false;
            const oldX = spark.x;
            const oldY = spark.y;
            spark.vy += 155 * dt;
            spark.x += spark.vx * dt;
            spark.y += spark.vy * dt;
            context.globalAlpha = (1 - spark.age / spark.life) ** 1.4;
            context.strokeStyle = spark.color;
            context.lineWidth = spark.size;
            context.shadowBlur = 5;
            context.shadowColor = '#ffaf28';
            context.beginPath();
            context.moveTo(oldX - spark.vx * .016, oldY - spark.vy * .016);
            context.lineTo(spark.x, spark.y);
            context.stroke();
            return true;
        });
        context.restore();
    }

    function chaseLight() {
        clearTimeout(chargeTimer);
        panel.classList.add('is-charged');
        chargeTimer = setTimeout(() => panel.classList.remove('is-charged'), reducedMotion.matches ? 180 : lapDuration + lightSegments.at(-1).delay);
        if (!context || document.hidden || reducedMotion.matches || !perimeterLength) return;
        // Three short, staggered accents travel from separate points at different intensities.
        // Reuse the same three paths on repeat clicks to keep animation work bounded.
        const start = performance.now();
        laps = lightRuns.map((run, index) => {
            const segment = lightSegments[index];
            run.style.opacity = '0';
            for (const stroke of run.children) stroke.style.strokeDasharray = `${segment.length} ${1 - segment.length}`;
            return { ...segment, run, start: start + segment.delay, lastSpark: 0 };
        });
        if (!frame) frame = requestAnimationFrame(drawConfetti);
    }

    function drawConfetti(time) {
        const elapsed = (time - (previousTime || time)) / 1000;
        const dt = Math.min(elapsed, .032);
        const motionTime = Math.min(elapsed, .15);
        previousTime = time;
        context.clearRect(0, 0, width, height);

        burstQueue = burstQueue.filter(launch => {
            if (time < launch.at) return true;
            emitBurst(launch.level, launch.parts);
            return false;
        });

        particles = particles.filter(particle => {
            const travelTime = particle.fresh ? 0 : motionTime;
            particle.age += particle.fresh ? 0 : elapsed;
            particle.fresh = false;

            // Integrate real elapsed time so a slower frame rate never becomes slow motion.
            const gravity = reducedMotion.matches ? 100 : particle.gravity;
            const drag = particle.drag;
            const decay = Math.exp(-drag * travelTime);
            particle.x += particle.vx * (1 - decay) / drag;
            particle.vx *= decay;
            particle.y += particle.vy * travelTime + .5 * gravity * travelTime * travelTime;
            particle.vy += gravity * travelTime;
            particle.rotation += particle.spin * travelTime;

            const gentle = reducedMotion.matches;
            if (particle.y > height + particle.size || (gentle && particle.age >= particle.life)) return false;

            const fade = gentle ? Math.min(1, (particle.life - particle.age) / .18) : 1;
            const flutter = reducedMotion.matches ? 1 : Math.cos(particle.age * 14 + particle.phase);
            context.save();
            context.globalAlpha = fade;
            context.translate(particle.x, particle.y);
            context.rotate(particle.rotation);
            // Keep the hearts and flowers recognizable while the paper tumbles freely.
            context.scale(1, particle.kind === 'paper' ? flutter * .75 + .25 : .88 + Math.abs(flutter) * .12);
            context.fillStyle = particle.color;
            if (particle.kind === 'paper') {
                context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
            } else {
                context.scale(particle.size, particle.size);
                context.fill(particle.kind === 'heart' ? heartShape : flowerShape);
                if (particle.kind === 'flower') {
                    // Forget-me-nots have five blue petals around a small pale ring and yellow eye.
                    context.beginPath();
                    context.arc(0, 0, .14, 0, Math.PI * 2);
                    context.fillStyle = '#e5f6ff';
                    context.fill();
                    context.beginPath();
                    context.arc(0, 0, .085, 0, Math.PI * 2);
                    context.fillStyle = '#ffe04b';
                    context.fill();
                }
            }
            context.restore();
            return true;
        });

        drawPerimeter(time, elapsed, dt);

        if (particles.length || sparks.length || laps.length || burstQueue.length) {
            frame = requestAnimationFrame(drawConfetti);
        } else {
            context.clearRect(0, 0, width, height);
            frame = 0;
            previousTime = 0;
        }
    }

    function emitBurst(level, parts = 1) {
        if (!context || document.hidden) return;
        const gentle = reducedMotion.matches;
        const requested = (gentle ? 8 : width <= 600 ? 144 : 192) / parts;
        const limit = width <= 600 ? 768 : maxParticles;
        // Admit new particles only when there is room; never remove visible ones to make space.
        const amount = Math.max(0, Math.min(requested, limit - particles.length));
        const launcher = launchLevels[level];
        const throwSpeed = Math.min(1800, Math.max(620, width * .85, height * .95));
        const spreadX = gentle ? 8 : Math.min(36, width * .07);
        const spreadY = gentle ? 8 : Math.min(144, height * .16);
        const minY = Math.max(16, height * launcher.height - spreadY / 2);
        const maxY = Math.min(height - 16, height * launcher.height + spreadY / 2);

        for (let i = 0; i < amount; i++) {
            const fromLeft = i % 2 === 0;
            // Pair matching shapes across the two launchers, with fresh trajectories each time.
            const kind = ['paper', 'heart', 'flower', 'paper'][Math.floor(i / 2) % 4];
            const angle = launcher.angle + (Math.random() - .5) * (gentle ? .85 : 1.3);
            const speed = gentle ? 12 + Math.random() * 18 : throwSpeed * (.75 + Math.random() * .55);
            const vx = Math.cos(angle) * speed * (fromLeft ? 1 : -1);
            particles.push({
                x: fromLeft ? 4 + Math.random() * spreadX : width - 4 - Math.random() * spreadX,
                y: minY + Math.random() * (maxY - minY),
                vx,
                vy: Math.sin(angle) * speed,
                // Air drag keeps each trajectory inside the opposite edge until it falls out below.
                drag: gentle ? .3 : Math.max(.8, Math.abs(vx) / Math.max(1, width - spreadX * 2 - 24)),
                kind,
                rotation: kind === 'paper' ? Math.random() * Math.PI : (Math.random() - .5) * .7,
                spin: gentle ? 0 : (Math.random() - .5) * (kind === 'paper' ? 22 : 4.2),
                size: kind === 'paper' ? 5 + Math.random() * 6 : 14 + Math.random() * 9,
                color: kind === 'heart' ? (Math.random() < .5 ? '#ff1744' : '#f90832') :
                    kind === 'flower' ? (Math.random() < .5 ? '#288cff' : '#447bff') :
                    colors[Math.floor(Math.random() * colors.length)],
                phase: Math.random() * Math.PI * 2,
                gravity: kind === 'paper' ? 1320 : 1040,
                fresh: true,
                age: 0,
                life: gentle ? .24 : null
            });
        }

    }

    function burst() {
        if (!context || document.hidden) return;
        const now = performance.now();
        const interval = reducedMotion.matches ? 140 : 520;
        const parts = reducedMotion.matches ? 1 : 6;
        emitBurst(0, parts);
        // Spread each round across a short spray instead of crowding its whole quantity at the nozzle.
        // Bound pending packets as well as live particles during rapid clicks.
        burstQueue = burstQueue.slice(-36);
        for (let level = 0; level < launchLevels.length; level++) {
            for (let part = 0; part < parts; part++) {
                if (level === 0 && part === 0) continue;
                burstQueue.push({ level, parts, at: now + level * interval + part * 28 });
            }
        }
        if (!frame) frame = requestAnimationFrame(drawConfetti);
    }

    button.addEventListener('click', () => {
        sharedCounter.increment();
        document.dispatchEvent(new CustomEvent('counter:increment'));

        clearTimeout(pressTimer);
        button.classList.add('is-pressed');
        pressTimer = setTimeout(() => button.classList.remove('is-pressed'), 95);

        countAnimation?.cancel();
        if (!reducedMotion.matches) {
            countAnimation = countOutput.animate([
                { transform: 'translateY(4px)', opacity: .65 },
                { transform: 'translateY(0)', opacity: 1 }
            ], { duration: 160, easing: 'ease-out' });
        }
        burst();
        chaseLight();
    });

    // A held key is one press; fresh presses and rapid clicks still count individually.
    button.addEventListener('keydown', event => {
        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    });

    reducedMotion.addEventListener('change', () => {
        stopConfetti();
        countAnimation?.cancel();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopConfetti();
    });

    window.addEventListener('pagehide', stopConfetti);
    sharedCounter.subscribe(state => {
        if (countOutput.textContent !== state.value) {
            countOutput.textContent = state.value;
            fitCount();
        }
        countOutput.setAttribute('aria-busy', String(!state.ready || state.pending > 0));
        syncStatus.textContent = state.pending && !state.durable
            ? '点击正在同步，请保持页面打开。'
            : state.error ? (state.pending ? `还有 ${state.pending} 次点击等待同步，连接恢复后会自动继续。` : '暂时无法同步计数，稍后会自动重试。')
            : !state.ready ? '正在读取累计计数…' : '';
        syncStatus.hidden = !syncStatus.textContent;
    });

    window.addEventListener('resize', resizeCanvas);
    const layoutObserver = new ResizeObserver(() => {
        fitCount();
        updateGlassCutouts();
        updatePerimeter();
    });
    for (const element of [panel, display, buttonWell]) layoutObserver.observe(element);
    resizeCanvas();
    fitCount();
    updateGlassCutouts();
    updatePerimeter();
})();
