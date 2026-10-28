const SVG_NS = 'http://www.w3.org/2000/svg';
const noise = seed => {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
};
const pointText = point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`;

export function getDiamondBoundary(rect, outlineOffset, outlineWidth) {
    // getBoundingClientRect includes the rotated border, but excludes its outer outline.
    const padding = Math.SQRT2 * (Math.max(0, outlineOffset) + outlineWidth);
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
        rx: rect.width / 2 + padding, ry: rect.height / 2 + padding };
}

// Use the nearest corner of the outer outline, keeping all anchors on diamond vertices.
function vertex(node, target) {
    const vertices = [
        { x: node.x, y: node.y + node.ry },
        { x: node.x + node.rx, y: node.y },
        { x: node.x, y: node.y - node.ry },
        { x: node.x - node.rx, y: node.y }
    ];
    const distance = point => (point.x - target.x) ** 2 + (point.y - target.y) ** 2;
    return vertices.reduce((nearest, point) => distance(point) < distance(nearest) ? point : nearest);
}

export function buildThoughtConnections(origin, nodes) {
    const connections = nodes.map((node, index) => ({
        from: origin, to: vertex(node, origin), width: 1.7 + noise(index + 3) * 1.3, seed: index + 1
    }));
    const pairs = new Set();
    function connect(a, b) {
        const key = [Math.min(a, b), Math.max(a, b)].join(':');
        if (a === b || pairs.has(key)) return;
        pairs.add(key);
        connections.push({ from: vertex(nodes[a], nodes[b]), to: vertex(nodes[b], nodes[a]),
            width: .8 + noise(a * 17 + b) * 1.1, seed: 101 + a * 37 + b });
    }
    if (nodes.length <= 8) {
        for (let a = 0; a < nodes.length; a++) {
            for (let b = a + 1; b < nodes.length; b++) connect(a, b);
        }
    } else {
        // Keep a large collection connected without a quadratic web of overlapping bolts.
        const order = nodes.map((node, index) => ({ index, angle: Math.atan2(node.y - origin.y, node.x - origin.x) }))
            .sort((a, b) => a.angle - b.angle);
        order.forEach((node, index) => connect(node.index, order[(index + 1) % order.length].index));
        nodes.forEach((node, index) => {
            const nearest = nodes.map((other, next) => ({ next, distance: Math.hypot(other.x - node.x, other.y - node.y) }))
                .filter(other => other.next !== index).sort((a, b) => a.distance - b.distance).slice(0, 2);
            nearest.forEach(other => connect(index, other.next));
        });
    }
    return connections;
}

export function createBoltGeometry({ from, to, width, seed }, time) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return { body: '', branch: '', spine: '' };
    const normal = { x: -dy / length, y: dx / length };
    const count = Math.max(8, Math.min(80, Math.ceil(length / 11)));
    const amplitude = Math.min(15, length * .075);
    const points = [];
    const left = [];
    const right = [];
    for (let index = 0; index <= count; index++) {
        const progress = index / count;
        const random = noise(seed * 29 + index * 7);
        const envelope = Math.sin(progress * Math.PI) ** .8;
        // Broad bends and fine irregularity move at different rates, like a living current.
        const bend = Math.sin(progress * Math.PI * 4 + seed + time * .65) * .52;
        const detail = (random - .5) * .65 + Math.sin(time * 3.4 + index * 2.3 + seed) * .18;
        const offset = envelope * amplitude * (bend + detail);
        const point = { x: from.x + dx * progress + normal.x * offset, y: from.y + dy * progress + normal.y * offset };
        const halfWidth = width * (.2 + .8 * (1 - progress)) * (.48 + random * .7) / 2;
        points.push(point);
        left.push({ x: point.x + normal.x * halfWidth, y: point.y + normal.y * halfWidth });
        right.push({ x: point.x - normal.x * halfWidth, y: point.y - normal.y * halfWidth });
    }
    // Thin secondary currents split away and merge back into the same moving main path.
    const branches = [];
    for (let fork = 0; fork < 2; fork++) {
        const start = Math.floor(count * (.25 + fork * .3));
        const end = Math.min(count - 1, start + Math.max(3, Math.floor(count * .18)));
        const split = (noise(seed * 13 + fork) > .5 ? 1 : -1) * Math.min(9, length * .04);
        const branch = [points[start]];
        for (let index = start + 1; index < end; index++) {
            const progress = (index - start) / (end - start);
            const anchor = points[index];
            const spread = Math.sin(progress * Math.PI) * (split + Math.sin(time * 2 + seed + index) * .9);
            branch.push({ x: anchor.x + normal.x * spread, y: anchor.y + normal.y * spread });
        }
        branch.push(points[end]);
        branches.push(`M${branch.map(pointText).join(' L')}`);
    }
    return {
        body: `M${left.map(pointText).join(' L')} L${right.reverse().map(pointText).join(' L')} Z`,
        branch: branches.join(' '),
        spine: `M${points.map(pointText).join(' L')}`
    };
}

export function createThoughtLinks({ stage, svg, cards, portrait }) {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let dirty = true;
    let frame = 0;
    let lastPaint = -Infinity;
    let bolts = [];
    let source = null;

    function element(tag, attributes = {}) {
        const node = document.createElementNS(SVG_NS, tag);
        for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
        return node;
    }
    function measure() {
        dirty = false;
        const bounds = stage.getBoundingClientRect();
        svg.setAttribute('viewBox', `0 0 ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}`);
        svg.replaceChildren();
        bolts = [];
        source = null;
        if (!bounds.width || !bounds.height) return;
        const image = portrait.getBoundingClientRect();
        const origin = { x: image.left - bounds.left + image.width * .51, y: image.top - bounds.top + image.height * .085 };
        const cardViewport = cards.getBoundingClientRect();
        const diamonds = [...cards.querySelectorAll('.thought-diamond')].map(card => {
            const rect = card.getBoundingClientRect();
            const style = getComputedStyle(card);
            const boundary = getDiamondBoundary({ x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height },
                parseFloat(style.outlineOffset) || 0, parseFloat(style.outlineWidth) || 0);
            const centreY = rect.top + rect.height / 2;
            return { ...boundary, equipped: card.closest('.thought-card').classList.contains('is-equipped'),
                visible: centreY >= cardViewport.top && centreY <= cardViewport.bottom };
        });
        const nodes = diamonds.filter(card => card.equipped && card.visible);
        if (!nodes.length) return;
        const defs = element('defs');
        const mask = element('mask', { id: 'mind-thought-frame-cutout', maskUnits: 'userSpaceOnUse',
            x: 0, y: 0, width: bounds.width, height: bounds.height, 'mask-type': 'luminance' });
        mask.append(element('rect', { width: bounds.width, height: bounds.height, fill: 'white' }));
        diamonds.filter(card => card.visible).forEach(({ x, y, rx, ry }) => {
            mask.append(element('polygon', { fill: 'black', points: `${x},${y - ry} ${x + rx},${y} ${x},${y + ry} ${x - rx},${y}` }));
        });
        defs.append(mask);
        const currents = element('g', { mask: 'url(#mind-thought-frame-cutout)' });
        svg.append(defs, currents);
        bolts = buildThoughtConnections(origin, nodes).map(connection => {
            const group = element('g');
            const halo = element('path', { class: 'thought-current-halo' });
            const body = element('path', { class: 'thought-current' });
            const branch = element('path', { class: 'thought-current-branch' });
            const core = element('path', { class: 'thought-current-core' });
            const flow = element('path', { class: 'thought-current-flow', pathLength: 1000 });
            group.append(halo, branch, body, core, flow);
            currents.append(group);
            return { connection, group, halo, body, branch, core, flow };
        });
        if (nodes.length) {
            source = element('circle', { class: 'thought-source', cx: origin.x, cy: origin.y, r: 1.8 });
            svg.append(source);
        }
    }
    function schedule() {
        if (!frame && visible && !document.hidden && (dirty || (bolts.length && !motion.matches))) {
            frame = requestAnimationFrame(paint);
        }
    }
    function paint(now) {
        frame = 0;
        if (!visible || document.hidden) return;
        const changed = dirty;
        if (dirty) measure();
        if (changed || now - lastPaint >= 40) {
            lastPaint = now;
            const time = motion.matches ? 0 : now / 1000;
            bolts.forEach(({ connection, group, halo, body, branch, core, flow }) => {
                const geometry = createBoltGeometry(connection, time);
                halo.setAttribute('d', geometry.body);
                body.setAttribute('d', geometry.body);
                branch.setAttribute('d', geometry.branch);
                core.setAttribute('d', geometry.spine);
                flow.setAttribute('d', geometry.spine);
                flow.setAttribute('stroke-dashoffset', String(50 - (time * 270 + connection.seed * 73) % 1050));
                flow.setAttribute('opacity', motion.matches ? '0' : '.8');
                branch.setAttribute('opacity', String(.24 + .3 * (.5 + .5 * Math.sin(time * 2.6 + connection.seed))));
                group.setAttribute('opacity', String(.65 + .3 * (.5 + .5 * Math.sin(time * 2.2 + connection.seed))));
            });
            source?.setAttribute('opacity', String(.75 + Math.sin(time * 2) * .15));
        }
        schedule();
    }
    function refresh() { dirty = true; schedule(); }
    function pause() { cancelAnimationFrame(frame); frame = 0; }
    const resize = new ResizeObserver(refresh);
    [stage, cards, portrait].forEach(node => resize.observe(node));
    portrait.addEventListener('load', refresh);
    cards.addEventListener('scroll', refresh, { passive: true });
    document.fonts?.ready.then(refresh);
    motion.addEventListener('change', () => { pause(); refresh(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else refresh(); });
    return {
        refresh,
        setVisible(value) {
            visible = value;
            if (value) refresh();
            else { pause(); svg.replaceChildren(); bolts = []; source = null; }
        }
    };
}
