(() => {
    const canvas = document.querySelector('#imagesEntry canvas');
    const context = canvas?.getContext('2d');
    if (!context) return;

    // Flat silver geometry; open space between the shards expands with each breath.
    const size = 300;
    const center = size / 2;
    const radius = 140;
    const angle = Math.PI / 6;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const silver = '#c0c0c0';
    canvas.width = canvas.height = size * ratio;
    context.scale(ratio, ratio);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const entry = canvas.closest('a');
    let entering = false;
    let frame = 0;
    let elapsed = 0;
    let previous = null;

    function point(distance, turn) {
        return [Math.cos(turn) * distance, Math.sin(turn) * distance];
    }

    function polygon(points, fill = false) {
        context.beginPath();
        context.moveTo(...points[0]);
        for (const vertex of points.slice(1)) context.lineTo(...vertex);
        context.closePath();
        if (fill) context.fill();
        else context.stroke();
    }

    function geometry(time) {
        const shards = [];
        const breath = (1 - Math.cos(time * Math.PI / 4)) / 2;
        const scale = .88 + breath * .12;
        const spin = time * .025;
        const transform = vertices => vertices.map(([x, y]) => [
            center + (x * Math.cos(spin) - y * Math.sin(spin)) * scale,
            center + (x * Math.sin(spin) + y * Math.cos(spin)) * scale
        ]);

        for (let sector = 0; sector < 12; sector++) {
            for (let row = 0; row < 4; row++) {
                const wave = Math.sin(time * .55 - row * .7);
                const distance = [28, 57, 89, 121][row] + wave * (row + 1) * 1.1;
                const halfLength = [10, 14, 17, 15][row];
                const spread = [.17, .145, .12, .095][row] * (1 - breath * .23);
                const turn = sector * angle + (row % 2 ? angle / 2 : 0)
                    + Math.sin(time * .3) * .065 * (row % 2 ? 1 : -1);
                const inner = point(distance - halfLength, turn);
                const outer = point(Math.min(radius, distance + halfLength), turn);
                const left = point(distance, turn - spread);
                const right = point(distance, turn + spread);
                // Separate, solid triangles keep the mirrored facets crisp and airy.
                const middle = point(distance, turn);
                const inset = vertices => vertices.map(vertex => [
                    middle[0] + (vertex[0] - middle[0]) * .64,
                    middle[1] + (vertex[1] - middle[1]) * .64
                ]);
                const fills = row % 2
                    ? [inset([inner, left, middle]), inset([outer, right, middle])]
                    : [inset([inner, left, right]), inset([outer, right, left])];
                shards.push({ row, sector, outline: transform([inner, left, outer, right]),
                    fills: fills.map(transform) });
            }
        }
        return shards;
    }

    function draw(time) {
        context.clearRect(0, 0, size, size);
        context.fillStyle = context.strokeStyle = silver;
        context.lineWidth = .85;
        context.lineJoin = 'miter';
        for (const shard of geometry(time)) {
            polygon(shard.outline);
            shard.fills.forEach(vertices => polygon(vertices, true));
        }
    }

    function animate(now) {
        frame = 0;
        if (entering || document.hidden || reducedMotion.matches) { previous = null; return; }
        if (previous === null) previous = now;
        if (now - previous >= 1000 / 30) {
            elapsed += Math.min((now - previous) / 1000, .1);
            previous = now;
            draw(elapsed);
        }
        frame = requestAnimationFrame(animate);
    }

    function syncAnimation() {
        cancelAnimationFrame(frame);
        previous = null;
        frame = 0;
        if (!entering && !document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(animate);
        else draw(elapsed);
    }

    entry.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
            || event.shiftKey || event.altKey) return;
        if (entering) { event.preventDefault(); return; }
        if (!window.BlackDoorImagesJourney) return;
        const bounds = canvas.getBoundingClientRect();
        const map = vertices => vertices.map(([x, y]) => [
            bounds.left + x / size * bounds.width, bounds.top + y / size * bounds.height
        ]);
        const shards = geometry(elapsed).map(shard => ({ ...shard,
            outline: map(shard.outline), fills: shard.fills.map(map) }));
        if (window.BlackDoorImagesJourney.start({ href: entry.href, shards, onReset() {
            entering = false;
            entry.style.visibility = '';
            syncAnimation();
        } })) {
            event.preventDefault();
            entering = true;
            cancelAnimationFrame(frame);
            entry.style.visibility = 'hidden';
        }
    });

    draw(0);
    document.addEventListener('visibilitychange', syncAnimation);
    reducedMotion.addEventListener('change', syncAnimation);
    syncAnimation();
})();
