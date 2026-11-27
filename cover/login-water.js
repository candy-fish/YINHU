(() => {
    const water = document.querySelector('.login-water');
    const canvas = water?.querySelector('canvas');
    const context = canvas?.getContext('2d');
    if (!context) return;

    const fishLayer = document.createElement('canvas');
    const fishContext = fishLayer.getContext('2d');
    const sampleLayer = document.createElement('canvas');
    const sampleContext = sampleLayer.getContext('2d', { willReadFrequently: true });
    const warpedSprite = document.createElement('canvas');
    const warpContext = warpedSprite.getContext('2d');
    if (!fishContext || !sampleContext || !warpContext) return;

    const koi = {
        body: new Path2D('M 49 0 C 49 -7 35 -14 21 -14 C 1 -15 -13 -8 -24 -5 L -41 -2 Q -44 0 -41 2 L -24 5 C -13 8 1 15 21 14 C 35 14 49 7 49 0 Z'),
        fins: new Path2D('M 24 -11 Q 17 -23 3 -26 Q 0 -21 13 -11 Z M 21 11 Q 14 25 0 27 Q 0 21 10 11 Z M -14 -7 Q -25 -17 -31 -12 Q -28 -6 -24 -4 Z M -15 7 Q -24 16 -30 12 Q -29 8 -22 4 Z M -38 -2 C -47 -4 -51 -16 -66 -17 Q -63 -8 -54 -1 Q -62 5 -67 16 C -54 15 -46 7 -38 2 Z'),
        spots: [[33, -4, 10, 5], [12, 7, 10, 5], [-3, -6, 9, 4], [-25, 1, 8, 4]],
        length: 116, stroke: 2.25, bend: 9
    };
    const ray = {
        body: new Path2D('M 34 0 Q 34 -7 22 -12 C 10 -21 -3 -37 -20 -42 Q -25 -38 -21 -29 Q -12 -12 -23 -8 Q -37 -4 -36 0 Q -37 4 -23 8 Q -12 12 -21 29 Q -25 38 -20 42 C -3 37 10 21 22 12 Q 34 7 34 0 Z'),
        fins: new Path2D('M 30 -3 Q 40 -7 40 -12 Q 33 -12 25 -8 Z M 30 3 Q 40 7 40 12 Q 33 12 25 8 Z M -31 -3 Q -47 -3 -68 1 Q -79 2 -89 0 Q -76 6 -65 4 L -31 2 Z'),
        spots: [[19, 1, 9, 7], [-10, -26, 7, 13], [-10, 26, 7, 13], [-16, 0, 13, 5]],
        length: 116, stroke: 1.55, bend: 9, lift: .11
    };
    const batfish = {
        body: new Path2D('M 35 0 Q 34 -8 23 -12 C 11 -15 4 -34 -18 -45 Q -17 -32 -24 -26 Q -13 -22 -24 -13 Q -34 -7 -33 0 Q -34 7 -24 13 Q -13 22 -24 26 Q -17 32 -18 45 C 4 34 11 15 23 12 Q 34 8 35 0 Z'),
        fins: new Path2D('M -30 -4 Q -42 -4 -55 -2 Q -63 -1 -69 4 Q -61 3 -54 2 L -30 3 Z'),
        spots: [[17, -1, 11, 7], [-9, -24, 8, 14], [-9, 24, 8, 14], [-19, 0, 10, 5]],
        length: 104, stroke: 1.85, bend: 5, lift: .16
    };
    const whale = {
        body: new Path2D('M 55 0 C 55 -9 45 -16 30 -18 C 10 -21 -10 -15 -28 -9 C -43 -5 -55 -4 -65 -2 Q -68 0 -65 2 C -55 4 -42 5 -28 10 C -10 16 10 21 30 18 C 45 16 55 9 55 0 Z'),
        fins: new Path2D('M 19 -14 C 6 -17 -7 -28 -25 -34 Q -33 -36 -36 -33 Q -29 -27 -21 -24 C -11 -16 -6 -11 7 -10 Z M 18 14 C 6 18 -7 29 -23 35 Q -30 38 -35 35 Q -30 29 -22 25 C -12 17 -6 12 7 10 Z M -60 -1 C -69 -8 -75 -19 -89 -26 Q -91 -20 -87 -13 Q -83 -5 -77 0 Q -83 5 -87 13 Q -91 21 -89 26 C -75 20 -69 9 -60 1 Z'),
        spots: [[42, -6, 14, 6], [33, 10, 15, 5], [10, 0, 26, 6], [-20, 6, 24, 5], [-20, -27, 17, 6], [-23, 29, 16, 5], [-82, 14, 8, 11], [-82, -14, 8, 11]],
        length: 145, stroke: 1.2, bend: 6, lift: .065
    };
    const sardine = {
        body: new Path2D('M 52 0 Q 37 -14 8 -13 Q -16 -11 -40 0 Q -15 11 8 13 Q 36 14 52 0 Z'),
        fins: new Path2D('M -34 0 Q -46 -6 -64 -20 Q -61 -5 -52 0 Q -61 5 -64 20 Q -46 6 -34 0 Z M 11 -11 Q -1 -22 -11 -20 L -7 -9 Z'),
        spots: [[16, 2, 32, 4]],
        length: 116, strip: 12, stroke: 3, bend: 9
    };
    const reefFish = {
        body: new Path2D('M 49 0 C 43 -10 29 -16 15 -20 Q 0 -26 -13 -17 Q -29 -10 -40 0 Q -28 9 -12 18 Q 1 25 16 19 Q 38 13 49 0 Z'),
        fins: new Path2D('M -35 0 Q -47 -10 -63 -17 Q -65 -10 -55 0 Q -64 9 -63 17 Q -47 10 -35 0 Z M 8 -20 Q -2 -29 -12 -26 L -18 -16 Z'),
        spots: [[28, -3, 7, 15], [2, 4, 8, 18], [-20, 0, 6, 11]],
        length: 112, strip: 12, stroke: 2.7, bend: 8
    };

    const fish = [
        { shape: whale, size: 346, x: .53, y: .29, rx: .16, ry: .12, phase: .76, period: 146, opacity: .74, seed: 89 },
        { shape: koi, size: 235, x: .23, y: .29, rx: .14, ry: .14, phase: .59, period: 75, opacity: .91, seed: 41 },
        { shape: koi, size: 276, x: .79, y: .27, rx: .16, ry: .14, phase: .08, period: 93, opacity: .87, seed: 23 },
        { shape: koi, size: 214, x: .23, y: .69, rx: .18, ry: .16, phase: .16, period: 82, opacity: .78, seed: 67 },
        { shape: batfish, size: 142, x: .45, y: .46, rx: .125, ry: .10, phase: .65, period: 87, opacity: .76, seed: 97 },
        { shape: ray, size: 296, x: .77, y: .77, rx: .16, ry: .14, phase: .64, period: 106, opacity: .83, seed: 61 }
    ];
    const schools = [
        { shape: sardine, x: .28, y: .57, rx: .11, ry: .10, phase: .55, period: 80, seed: 109, count: 50 },
        { shape: reefFish, x: .78, y: .86, rx: .13, ry: .09, phase: .94, period: 93, seed: 151, count: 8 }
    ];
    const formation = [
        [44, 1], [23, -13], [18, 15], [1, -25], [0, 3], [-8, 27], [-22, -12], [-25, 15],
        [-39, -24], [-44, 1], [-52, 23], [-64, -6], [-25, -40], [-31, 41], [-58, -35], [-59, 37],
        [-77, -22], [-79, 13], [-96, -6], [-86, 28], [46, -23], [38, 25], [-103, -30], [-109, 38],
        [18, -37], [10, 39], [-7, -51], [-12, 53], [-26, -59], [-29, 64], [-43, -50], [-45, 53],
        [-59, -64], [-62, 67], [-73, -48], [-76, 52], [-89, -62], [-91, 65], [-104, -49], [-107, 54],
        [-116, -10], [-114, 11], [-124, -32], [-126, 27], [-131, -51], [-132, 49], [-145, -16], [-146, 12],
        [-151, -36], [-149, 31]
    ];

    const tau = Math.PI * 2;
    const spriteDensity = 2;
    const spriteBounds = { left: -96, top: -57, width: 154, height: 114 };
    const glints = new Float32Array(7);
    glints[0] = 1;
    warpedSprite.width = spriteBounds.width * spriteDensity;
    warpedSprite.height = spriteBounds.height * spriteDensity;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let ratio = 1;
    let tileWidth = 0;
    let tileHeight = 0;
    let mosaicMask;
    let tileLight;
    let tileGlint;
    let currents = [];
    let frame = 0;
    let previousTime = 0;
    let elapsed = 0;

    // Both the water texture and the glass facets are stable across frames.
    function noise(x, y) {
        let hash = Math.imul(x + 97, 0x45d9f3b) ^ Math.imul(y + 193, 0x27d4eb2d);
        hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
        hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
        return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
    }

    function paintFish(shape) {
        const sprite = document.createElement('canvas');
        sprite.width = warpedSprite.width;
        sprite.height = warpedSprite.height;
        const paint = sprite.getContext('2d');
        paint.setTransform(spriteDensity, 0, 0, spriteDensity,
            -spriteBounds.left * spriteDensity, -spriteBounds.top * spriteDensity);

        const fins = paint.createLinearGradient(8, -34, -33, 37);
        fins.addColorStop(0, '#80808062');
        fins.addColorStop(.30, '#adadad87');
        fins.addColorStop(.47, '#d3d3d3b4');
        fins.addColorStop(.65, '#9999999e');
        fins.addColorStop(1, '#65656575');
        paint.fillStyle = fins;
        paint.fill(shape.fins);

        const body = paint.createLinearGradient(18, -26, 9, 25);
        body.addColorStop(0, '#3b3b3b');
        body.addColorStop(.25, '#888888b8');
        body.addColorStop(.40, '#e1e1e1d4');
        body.addColorStop(.46, '#f0f0f0de');
        body.addColorStop(.52, '#b9b9b9ca');
        body.addColorStop(.64, '#767676bb');
        body.addColorStop(.77, '#a1a1a1ad');
        body.addColorStop(1, '#454545b8');
        paint.fillStyle = body;
        paint.fill(shape.body);

        paint.globalCompositeOperation = 'source-atop';
        for (const [x, y, rx, ry] of shape.spots) {
            paint.save();
            paint.translate(x, y);
            paint.scale(rx, ry);
            const reflection = paint.createRadialGradient(0, 0, 0, 0, 0, 1);
            reflection.addColorStop(0, '#f2f2f25e');
            reflection.addColorStop(.5, '#dedede2e');
            reflection.addColorStop(1, '#dedede00');
            paint.fillStyle = reflection;
            paint.fillRect(-1, -1, 2, 2);
            paint.restore();
        }

        return sprite;
    }

    const sprites = new Map();
    for (const swimmer of [...fish, ...schools]) {
        const { shape } = swimmer;
        if (!sprites.has(shape)) sprites.set(shape, paintFish(shape));
        swimmer.sprite = sprites.get(shape);
    }
    for (const school of schools) {
        school.members = formation.slice(0, school.count).map(([along, across], index) => {
            const seed = school.seed + index * 11;
            return {
                shape: school.shape, sprite: school.sprite, seed, along, across,
                size: 28 + noise(seed, 61) * 13,
                opacity: .58 + noise(seed, 39) * .30
            };
        });
    }

    function swim(route, time = elapsed) {
        const start = route.phase * tau;
        const turn = start + time / route.period * tau;
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        const cross = turn * 2 + start;
        const horizontal = width * route.rx;
        const vertical = height * route.ry;
        const vx = horizontal * (-sin + .22 * Math.cos(cross));
        const vy = vertical * (cos + .18 * Math.sin(cross));
        const ax = horizontal * (-cos - .44 * Math.sin(cross));
        const ay = vertical * (-sin + .36 * Math.cos(cross));
        const curve = (vx * ay - vy * ax) / (vx * vx + vy * vy) * tau / route.period;
        return {
            x: width * route.x + horizontal * (cos + .11 * (Math.sin(cross) - Math.sin(start * 3))),
            y: height * route.y + vertical * (sin - .09 * (Math.cos(cross) - Math.cos(start * 3))),
            heading: Math.atan2(vy, vx),
            bank: Math.min(.28, Math.max(-.28, curve * 1.15)),
            depth: .93 + .07 * Math.cos(turn + start)
        };
    }

    function drawFish(fish, x, y, heading, sceneScale, bank = 0, depth = 1) {
        const { shape, seed } = fish;
        const scale = fish.size * sceneScale * (.92 + .08 * depth) / shape.length;
        const radius = shape.length * .77 * scale;
        if (x < -radius || x > width + radius || y < -radius || y > height + radius) return;

        // Flex the continuous image in tangent-aligned strips before applying the glass mask.
        const stroke = elapsed * shape.stroke + seed;
        const lift = 1 + Math.sin(stroke) * (shape.lift ?? 0) - Math.abs(bank) * .14;
        const liftOffset = -spriteBounds.top * spriteDensity * (1 - lift);
        const stripWidth = (shape.strip ?? 6) * spriteDensity;
        const spriteHeight = warpedSprite.height;
        const bendAt = pixel => {
            const localX = spriteBounds.left + pixel / spriteDensity;
            const flex = Math.max(0, (26 - localX) / 112) ** 1.7;
            return (Math.sin(stroke + localX * .057) * shape.bend + bank * 24) * flex * spriteDensity;
        };

        warpContext.resetTransform();
        warpContext.clearRect(0, 0, warpedSprite.width, spriteHeight);
        let bend = bendAt(0);
        for (let left = 0; left < warpedSprite.width; left += stripWidth) {
            const size = Math.min(stripWidth, warpedSprite.width - left);
            const nextBend = bendAt(left + size);
            const slope = (nextBend - bend) / size;
            warpContext.setTransform(1, slope, 0, lift, 0, liftOffset + bend - slope * left);
            warpContext.drawImage(fish.sprite, left, 0, size, spriteHeight, left, 0, size, spriteHeight);
            bend = nextBend;
        }

        fishContext.save();
        fishContext.translate(x, y);
        fishContext.rotate(heading);
        fishContext.scale(scale, scale);
        fishContext.globalAlpha = fish.opacity * depth;
        fishContext.drawImage(warpedSprite, spriteBounds.left, spriteBounds.top, spriteBounds.width, spriteBounds.height);
        fishContext.restore();
    }

    function drawSchool(school, sceneScale) {
        const { x, y, heading, bank, depth } = swim(school);
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        for (const member of school.members) {
            const drift = elapsed * 1.2 - member.along * .046;
            const along = (member.along + Math.sin(drift + member.seed) * 3) * sceneScale;
            const across = (member.across + Math.sin(drift) * 4) * sceneScale;
            const px = x + along * cos - across * sin;
            const py = y + along * sin + across * cos;
            const turn = heading + Math.cos(drift) * .09;
            drawFish(member, px, py, turn, sceneScale, bank, depth);
        }
    }

    function drawWake(swimmer, sceneScale) {
        const length = swimmer.size * sceneScale;
        for (let index = 0; index < 13; index++) {
            const age = index / 13;
            const { x, y, heading } = swim(swimmer, elapsed - index * .59);
            const back = length * .55 + index * 2.8 * sceneScale;
            const spread = (noise(swimmer.seed, index) - .5) * (14 + age * 34) * sceneScale;
            const wave = Math.sin(elapsed * 1.15 - index * .75 + swimmer.seed) * 4 * age;
            const px = x - Math.cos(heading) * back - Math.sin(heading) * (spread + wave);
            const py = y - Math.sin(heading) * back + Math.cos(heading) * (spread + wave);
            const glimmer = .72 + .28 * Math.sin(elapsed * 1.45 - index);
            context.globalAlpha = .3 * (1 - age) ** 1.25 * glimmer;
            context.fillRect(px, py, (1.6 + (1 - age) * 2.4) * sceneScale, .9);
        }
    }

    function drawMosaic() {
        // Each glass tile takes one color from the fish layer at a fixed screen position.
        const { width: columns, height: rows } = sampleLayer;
        sampleContext.clearRect(0, 0, columns, rows);
        sampleContext.drawImage(fishLayer, 0, 0, columns, rows);
        const image = sampleContext.getImageData(0, 0, columns, rows);
        const { data } = image;

        for (let group = 1; group < glints.length; group++) {
            const wave = Math.sin(elapsed * (1.28 + group * .17) + group * 1.37);
            glints[group] = 1 + wave * .14 + Math.max(0, wave) ** 4 * .26;
        }
        for (let cell = 0; cell < tileLight.length; cell++) {
            const offset = cell * 4;
            const coverage = data[offset + 3] / 255;
            if (coverage === 0) continue;
            const grain = tileLight[cell];
            const shimmer = glints[tileGlint[cell]];
            const silver = data[offset] * grain * shimmer;
            data[offset] = silver;
            data[offset + 1] = silver;
            data[offset + 2] = silver;
            data[offset + 3] *= Math.min(1, .56 + coverage * .32 + grain * .14);
        }
        sampleContext.putImageData(image, 0, 0);

        context.drawImage(sampleLayer, 0, 0, columns * tileWidth, rows * tileHeight);
        context.save();
        context.globalCompositeOperation = 'destination-in';
        context.fillStyle = mosaicMask;
        context.fillRect(0, 0, width, height);
        context.restore();
    }

    function draw() {
        if (!width || !height) return;
        fishContext.clearRect(0, 0, fishLayer.width, fishLayer.height);
        context.clearRect(0, 0, width, height);
        const sceneScale = Math.max(.63, Math.min(1.48, width / 1050, height / 650));
        for (const swimmer of fish) {
            const { x, y, heading, bank, depth } = swim(swimmer);
            drawFish(swimmer, x, y, heading, sceneScale, bank, depth);
        }
        for (const school of schools) drawSchool(school, sceneScale);
        drawMosaic();

        context.save();
        context.globalCompositeOperation = 'destination-over';
        context.fillStyle = '#b7b7b7';
        for (const swimmer of fish) drawWake(swimmer, sceneScale);
        for (const mark of currents) {
            const drift = Math.sin(elapsed * .36 + mark.y * .014) * 3;
            context.globalAlpha = mark.alpha;
            context.fillRect(mark.x + drift, mark.y, mark.length, mark.depth);
        }
        context.restore();
    }

    function resizeMosaic() {
        const compact = width <= 640;
        tileWidth = compact ? 3 : 4;
        tileHeight = compact ? 5 : 7;
        const columns = Math.ceil(width / tileWidth);
        const rows = Math.ceil(height / tileHeight);
        fishLayer.width = columns * tileWidth;
        fishLayer.height = rows * tileHeight;
        sampleLayer.width = columns;
        sampleLayer.height = rows;
        sampleContext.imageSmoothingQuality = 'high';

        const mask = document.createElement('canvas');
        const maskRepeat = 13;
        mask.width = tileWidth * maskRepeat;
        mask.height = tileHeight * maskRepeat;
        const facet = mask.getContext('2d');
        for (let row = 0; row < maskRepeat; row++) {
            for (let column = 0; column < maskRepeat; column++) {
                const x = column * tileWidth;
                const y = row * tileHeight;
                const cut = noise(column + 8, row - 21);
                const inset = cut < .15 ? .55 : 0;
                const faceWidth = tileWidth - 1 - inset * 2;
                const faceHeight = tileHeight - 1 - inset * 2;
                facet.fillStyle = cut < .06 ? '#ffffff86' : '#fff';
                facet.fillRect(x + inset, y + inset, faceWidth, faceHeight);
            }
        }
        mosaicMask = context.createPattern(mask, 'repeat');

        tileLight = new Float32Array(columns * rows);
        tileGlint = new Uint8Array(columns * rows);
        for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
                const index = row * columns + column;
                tileLight[index] = .65 + noise(column + 71, row - 32) * .49;
                if (noise(column + 24, row - 33) < .18) {
                    tileGlint[index] = 1 + Math.floor(noise(column - 41, row + 61) * (glints.length - 1));
                }
            }
        }
    }

    function resize() {
        const nextWidth = canvas.clientWidth;
        const nextHeight = canvas.clientHeight;
        const nextRatio = Math.min(devicePixelRatio || 1, 2);
        if (!nextWidth || !nextHeight || (width === nextWidth && height === nextHeight && ratio === nextRatio)) return;
        width = nextWidth;
        height = nextHeight;
        ratio = nextRatio;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.imageSmoothingEnabled = false;
        resizeMosaic();

        currents = [];
        const step = width <= 640 ? 9 : 12;
        for (let row = 0; row * step < height; row++) {
            for (let column = 0; column * step < width; column++) {
                const x = column * step;
                const y = row * step;
                const grain = noise(column + 53, row + 19);
                const wave = Math.sin(x / width * 10 + y / height * 9) + .45 * Math.sin(y / height * 19 - x / width * 7);
                if (grain < (Math.abs(wave) < .24 ? .69 : .988)) continue;
                const detail = noise(column - 38, row + 8);
                currents.push({ x: x + detail * 6, y: y + grain * 4, alpha: .14 + detail * .25,
                    length: 1 + detail * 2.8, depth: detail > .67 ? 1 : .75 });
            }
        }
        draw();
    }

    function tick(time) {
        if (!previousTime || time - previousTime >= 1000 / 32) {
            if (previousTime) elapsed += Math.min(time - previousTime, 80) / 1000;
            previousTime = time;
            draw();
        }
        frame = requestAnimationFrame(tick);
    }

    function syncMotion() {
        cancelAnimationFrame(frame);
        previousTime = 0;
        if (!motion.matches && !document.hidden) frame = requestAnimationFrame(tick);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', syncMotion);
    motion.addEventListener('change', syncMotion);
    window.addEventListener('blackdoor:unlocked', () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        window.removeEventListener('resize', resize);
        document.removeEventListener('visibilitychange', syncMotion);
        motion.removeEventListener('change', syncMotion);
        water.remove();
    }, { once: true });

    resize();
    syncMotion();
})();
