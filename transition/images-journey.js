const TAU = Math.PI * 2;
export const ARRIVAL_KEY = 'blackdoor.images.arrival.v1';
export const JOURNEY = Object.freeze({ pair: .46, follow: .055, release: .15, swim: .285, melt: .105,
    door: 11.35, eyes: 12.1, blackout: 12.65, end: 13 });
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const pointMix = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];

export function createStairway(width, height) {
    const portrait = width < height * .85;
    const start = [width * .045, height * .93];
    const top = [width * (portrait ? .70 : .73), height * (portrait ? .49 : .46)];
    const run = (top[0] - start[0]) / 12, rise = (start[1] - top[1]) / 12;
    const segments = [];
    for (let step = 0; step < 12; step++) {
        const a = [start[0] + run * step, start[1] - rise * step];
        const b = [a[0] + run, a[1]];
        const c = [b[0], a[1] - rise];
        segments.push([a, b], [b, c]);
    }
    const doorHeight = height * (portrait ? .24 : .29);
    const doorWidth = Math.min(width * (portrait ? .135 : .072), doorHeight * .46);
    const door = { x: top[0] + width * .035, y: top[1] - doorHeight,
        width: doorWidth, height: doorHeight };
    // Match images.css scene insets and images.js's world scale; all edges use its 6px road.
    let sceneTop = height >= 900 ? 220 : 198, sceneBottom = height >= 900 ? 160 : 142;
    if (width <= 760) { sceneTop = 184; sceneBottom = 164; }
    else if (height <= 660) { sceneTop = 140; sceneBottom = 110; }
    const sceneHeight = Math.max(height <= 600 ? 205 : 0, Math.max(height, height <= 600 ? 650 : 0) - sceneTop - sceneBottom);
    const sceneScale = Math.max(.3, Math.min(1, (sceneHeight - 10) / 650));
    return { start, top, segments, run, rise, door, roadWidth: 6 * sceneScale,
        landing: [Math.min(width * .96, door.x + doorWidth + width * .065), top[1]] };
}

export function orderShards(shards) {
    const byHeight = shards.slice().sort((a, b) => a.outline.reduce((sum, point) => sum + point[1], 0)
        - b.outline.reduce((sum, point) => sum + point[1], 0));
    const upper = byHeight.slice(0, 24).sort((a, b) => b.row - a.row || a.sector - b.sector);
    const lower = byHeight.slice(24).sort((a, b) => b.row - a.row || a.sector - b.sector);
    return Array.from({ length: 24 }, (_, group) => {
        const pool = group % 2 ? upper : lower, offset = Math.floor(group / 2) * 2;
        return pool.slice(offset, offset + 2);
    }).flat();
}

export function sampleFlight(origin, segment, index, time, height = Infinity) {
    const group = Math.floor(index / 2), follower = index % 2;
    const release = JOURNEY.release + group * JOURNEY.pair;
    const progress = clamp((time - release - follower * JOURNEY.follow) / JOURNEY.swim);
    // Both fish finish swimming before either begins melting into its half of the line.
    const morph = smooth((time - release - JOURNEY.follow - JOURNEY.swim) / JOURNEY.melt);
    const destination = pointMix(segment[0], segment[1], follower ? .25 : .75);
    const dx = destination[0] - origin[0], dy = destination[1] - origin[1];
    const distance = Math.hypot(dx, dy);
    const side = group % 2 ? -1 : 1;
    const safeY = y => Math.max(12, Math.min(height - 12, y));
    const bend = Math.min(115, Math.max(44, distance * .19));
    const control1 = [mix(origin[0], destination[0], .22), safeY(origin[1] + side * bend * .7)];
    const control2 = [Math.max(12, destination[0] - Math.min(65, Math.abs(dx) * .14)), safeY(destination[1] + side * bend)];
    const p = smooth(progress);
    const q = 1 - p;
    const position = [0, 1].map(axis => q ** 3 * origin[axis] + 3 * q * q * p * control1[axis]
        + 3 * q * p * p * control2[axis] + p ** 3 * destination[axis]);
    const tangent = [0, 1].map(axis => 3 * q * q * (control1[axis] - origin[axis])
        + 6 * q * p * (control2[axis] - control1[axis]) + 3 * p * p * (destination[axis] - control2[axis]));
    const heading = Math.atan2(tangent[1], tangent[0]);
    const tail = Math.sin(progress * TAU * 3.2 - follower * .7) * Math.sin(progress * Math.PI);
    const sway = tail * Math.sin(progress * Math.PI) * Math.min(9, distance * .05);
    position[0] -= Math.sin(heading) * sway;
    position[1] += Math.cos(heading) * sway;
    return { position, progress, morph, sway: tail, heading, side };
}

export function journeyPhase(time, reduced = false) {
    if (reduced) return { door: 0, eyes: 0, black: smooth(time / .28), done: time >= .38 };
    const eyeTime = (time - JOURNEY.eyes) / .55;
    return { door: smooth((time - JOURNEY.door) / .65),
        eyes: eyeTime > 0 && eyeTime < 1 ? Math.sin(eyeTime * Math.PI) ** 2 : 0,
        black: time >= JOURNEY.blackout ? 1 : 0, done: time >= JOURNEY.end };
}

function polygon(ctx, vertices, fill = false) {
    ctx.beginPath(); ctx.moveTo(...vertices[0]);
    for (const vertex of vertices.slice(1)) ctx.lineTo(...vertex);
    ctx.closePath();
    if (fill) ctx.fill(); else ctx.stroke();
}

function path(ctx, vertices, progress = 1) {
    const lengths = vertices.slice(1).map((vertex, i) => Math.hypot(vertex[0] - vertices[i][0], vertex[1] - vertices[i][1]));
    let remaining = lengths.reduce((sum, length) => sum + length, 0) * clamp(progress);
    ctx.beginPath(); ctx.moveTo(...vertices[0]);
    for (let i = 0; i < lengths.length && remaining > 0; i++) {
        ctx.lineTo(...pointMix(vertices[i], vertices[i + 1], Math.min(1, remaining / lengths[i])));
        remaining -= lengths[i];
    }
    ctx.stroke();
}

function haze(ctx, x, y, radius, color, opacity, stretch = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(stretch, 1);
    const light = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    light.addColorStop(0, color + Math.round(opacity * 255).toString(16).padStart(2, '0'));
    light.addColorStop(1, color + '00');
    ctx.fillStyle = light; ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();
}

function paintEdgeStars(ctx, width, height, time, opacity) {
    const band = Math.min(64, width * .12, height * .12);
    const perimeter = (width + height) * 2;
    const count = Math.max(60, Math.min(170, Math.round(perimeter / 34)));
    let seed = 826104;
    const random = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
    const colors = ['#C8EDEF', '#EBCEE5', '#BBDDC5', '#E9EDF3'];
    ctx.save(); ctx.lineWidth = .5;
    for (let i = 0; i < count; i++) {
        const along = random() * perimeter;
        const inset = 5 + random() ** 1.5 * (band - 5);
        let x, y;
        if (along < width) { x = along; y = inset; }
        else if (along < width + height) { x = width - inset; y = along - width; }
        else if (along < width * 2 + height) { x = width * 2 + height - along; y = height - inset; }
        else { x = inset; y = perimeter - along; }
        const bright = i % 13 === 0;
        const size = bright ? 1.7 : .65 + random() * .7;
        const alpha = .4 + random() * .4, period = 4 + random() * 5, phase = random() * TAU;
        ctx.globalAlpha = opacity * alpha * (.72 + .28 * Math.sin(time / period * TAU + phase));
        ctx.fillStyle = ctx.strokeStyle = colors[i % colors.length];
        ctx.beginPath(); ctx.arc(x, y, size / 2, 0, TAU); ctx.fill();
        if (bright) {
            ctx.globalAlpha *= .55;
            ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y);
            ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke();
        }
    }
    ctx.restore();
}

export function paintJourney(ctx, width, height, shards, time, reduced = false) {
    const phase = journeyPhase(time, reduced);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = `rgba(7,8,7,${reduced ? 0 : smooth(time / .65)})`;
    ctx.fillRect(0, 0, width, height);
    if (reduced) {
        ctx.fillStyle = `rgba(0,0,0,${phase.black})`; ctx.fillRect(0, 0, width, height);
        return phase;
    }

    const stairs = createStairway(width, height);
    ctx.save();
    const atmosphere = smooth((time - .4) / 2) * (1 - phase.black);
    // The doorway borrows the timeline's lime light, cold cyan and lilac haze.
    haze(ctx, width * .24, height * .79, height * .47, '#C5D951', atmosphere * .11, 1.5);
    haze(ctx, width * .59, height * .43, height * .42, '#39B6D8', atmosphere * .075, 1.35);
    haze(ctx, width * .85, height * .22, height * .30, '#EBCEE5', atmosphere * .045, 1.1);
    ctx.save();
    ctx.globalAlpha = atmosphere;
    for (let i = 0; i < 68; i++) {
        const x = ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1 * width;
        const y = ((Math.sin(i * 311.7) * 9814.717) % 1 + 1) % 1 * height;
        ctx.fillStyle = i % 4 ? '#C8EDEF' : '#EBCEE5';
        ctx.globalAlpha = atmosphere * (.08 + .11 * (1 + Math.sin(time * .4 + i)));
        ctx.fillRect(x, y, i % 5 ? .7 : 1.2, i % 5 ? .7 : 1.2);
    }
    ctx.restore();

    // A quiet side face gives the stair profile depth without filling in the sky.
    ctx.save();
    ctx.globalAlpha = smooth((time - .6) / .5) * .72;
    const completed = Math.max(0, Math.min(24, Math.floor((time - JOURNEY.release - JOURNEY.follow
        - JOURNEY.swim - JOURNEY.melt) / JOURNEY.pair) + 1));
    const profile = [stairs.start];
    stairs.segments.slice(0, completed).forEach(segment => profile.push(segment[1]));
    const faceEnd = completed === 24 ? stairs.landing : profile.at(-1);
    profile.push(faceEnd, [faceEnd[0], height], [stairs.start[0], height]);
    if (completed) { ctx.fillStyle = '#0c100c'; polygon(ctx, profile, true); }
    ctx.restore();

    for (let i = 0; i < shards.length; i++) {
        const shard = shards[i], segment = stairs.segments[Math.floor(i / 2)];
        const origin = shard.outline.reduce((sum, vertex) => [sum[0] + vertex[0] / 4, sum[1] + vertex[1] / 4], [0, 0]);
        const flight = sampleFlight(origin, segment, i, time, height);
        ctx.save();
        ctx.lineWidth = mix(1, stairs.roadWidth, flight.morph);
        if (flight.morph >= 1) {
            if (!(i % 2)) {
                ctx.strokeStyle = '#C5D951';
                path(ctx, segment);
            }
            ctx.restore(); continue;
        }
        if (flight.progress <= 0) {
            ctx.strokeStyle = ctx.fillStyle = '#c0c0c0';
            polygon(ctx, shard.outline); shard.fills.forEach(vertices => polygon(ctx, vertices, true));
            ctx.restore(); continue;
        }
        const originalHeading = Math.atan2(shard.outline[2][1] - shard.outline[0][1], shard.outline[2][0] - shard.outline[0][0]);
        const finalHeading = Math.atan2(segment[1][1] - segment[0][1], segment[1][0] - segment[0][0]);
        const turn = originalHeading + Math.atan2(Math.sin(flight.heading - originalHeading), Math.cos(flight.heading - originalHeading))
            * smooth(flight.progress / .24);
        const heading = turn + Math.atan2(Math.sin(finalHeading - turn), Math.cos(finalHeading - turn)) * flight.morph;
        const segmentLength = Math.hypot(segment[1][0] - segment[0][0], segment[1][1] - segment[0][1]) / 2;
        const halfLength = Math.hypot(shard.outline[2][0] - shard.outline[0][0], shard.outline[2][1] - shard.outline[0][1]) / 2;
        const tint = smooth(flight.progress);
        ctx.strokeStyle = ctx.fillStyle = `rgb(${Math.round(mix(192,197,tint))},${Math.round(mix(192,217,tint))},${Math.round(mix(192,81,tint))})`;
        const transform = vertices => vertices.map(vertex => {
            const dx = vertex[0] - origin[0], dy = vertex[1] - origin[1];
            const localX = dx * Math.cos(originalHeading) + dy * Math.sin(originalHeading);
            const localY = -dx * Math.sin(originalHeading) + dy * Math.cos(originalHeading);
            const x = localX * mix(1, segmentLength / (halfLength * 2), flight.morph);
            const y = localY * (1 - flight.morph) + flight.sway * (localX / halfLength) ** 2 * 7 * (1 - flight.morph);
            return [flight.position[0] + x * Math.cos(heading) - y * Math.sin(heading),
                flight.position[1] + x * Math.sin(heading) + y * Math.cos(heading)];
        });
        polygon(ctx, transform(shard.outline));
        ctx.globalAlpha = 1 - flight.morph;
        shard.fills.forEach(vertices => polygon(ctx, transform(vertices), true));
        ctx.restore();
    }

    const door = stairs.door;
    // Fill the doorway before the shared sill/platform stroke, keeping its full thickness visible.
    if (phase.door > 0) {
        ctx.save(); ctx.globalAlpha = phase.door;
        ctx.fillStyle = '#000'; ctx.fillRect(door.x, door.y, door.width, door.height);
        ctx.restore();
    }

    const landingProgress = smooth((time - (JOURNEY.door - .16)) / .35);
    ctx.save(); ctx.strokeStyle = '#C5D951'; ctx.lineWidth = stairs.roadWidth;
    path(ctx, [stairs.top, stairs.landing], landingProgress);
    ctx.restore();

    if (phase.door > 0) {
        ctx.save(); ctx.globalAlpha = phase.door;
        ctx.strokeStyle = '#C5D951'; ctx.lineWidth = stairs.roadWidth;
        path(ctx, [[door.x, door.y + door.height], [door.x, door.y],
            [door.x + door.width, door.y], [door.x + door.width, door.y + door.height]], phase.door);
        ctx.restore();
    }

    if (phase.eyes > 0) {
        ctx.save(); ctx.globalAlpha = phase.eyes;
        const x = door.x + door.width * .5, y = door.y + door.height * .43;
        const spread = door.width * .205, eyeWidth = door.width * .17, eyeHeight = eyeWidth * .48;
        haze(ctx, x, y, door.width * .60, '#C5D951', phase.eyes * .16, 1.1);
        // A single solid silhouette per eye, without a cutout pupil or outline.
        for (const side of [-1, 1]) {
            ctx.save(); ctx.translate(x + side * spread, y); ctx.rotate(side * -.16);
            ctx.beginPath(); ctx.moveTo(-eyeWidth / 2, 0);
            ctx.quadraticCurveTo(0, -eyeHeight, eyeWidth / 2, 0);
            ctx.quadraticCurveTo(0, eyeHeight, -eyeWidth / 2, 0);
            ctx.fillStyle = '#dceba2'; ctx.shadowColor = '#C5D951'; ctx.shadowBlur = 8; ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    // Slow, thin banks of mist drift across the stair face, echoing the reference.
    ctx.save(); ctx.globalAlpha = atmosphere * smooth((time - 1.8) / 2);
    for (let bank = 0; bank < 5; bank++) {
        const x = width * (.16 + bank * .18) + Math.sin(time * .17 + bank) * width * .025;
        const y = height * (.91 - bank * .075) + Math.cos(time * .22 + bank) * 12;
        haze(ctx, x, y, height * .10, bank % 2 ? '#C8EDEF' : '#C5D951', .045, 3.8);
    }
    ctx.restore();
    ctx.restore();
    // Keep the four edges visible above the stair's dark side face and drifting mist.
    paintEdgeStars(ctx, width, height, time, smooth(time / .65) * (1 - phase.black));
    if (phase.black > 0) { ctx.fillStyle = `rgba(0,0,0,${phase.black})`; ctx.fillRect(0, 0, width, height); }
    return phase;
}

function installJourney() {
    let active = null;
    window.BlackDoorImagesJourney = {
        start({ href, shards, onReset }) {
            if (active) return true;
            if (!Array.isArray(shards) || shards.length !== 48) return false;
            const overlay = document.createElement('div');
            overlay.className = 'images-journey';
            overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-label', '正在进入映相，按 Escape 返回');
            overlay.tabIndex = -1;
            const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
            if (!ctx) return false;
            canvas.setAttribute('aria-hidden', 'true');
            const status = document.createElement('span');
            status.className = 'images-journey-status'; status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite'); status.textContent = '万花筒碎片正在汇成光阶';
            overlay.dataset.phase = 'shards';
            overlay.append(canvas, status);
            const focus = document.activeElement;
            const inert = [...document.body.children].map(element => [element, element.inert]);
            const initialWidth = innerWidth, initialHeight = innerHeight;
            const source = orderShards(shards);
            let width, height, mapped, frame = 0, last = null, painted = -Infinity, elapsed = 0, navigated = false;
            const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
            let reduced = motion.matches;

            const resize = () => {
                width = innerWidth; height = innerHeight;
                const ratio = Math.min(devicePixelRatio || 1, 2);
                canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
                ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
                const map = vertices => vertices.map(([x, y]) => [x / initialWidth * width, y / initialHeight * height]);
                mapped = source.map(shard => ({ ...shard, outline: map(shard.outline), fills: shard.fills.map(map) }));
            };
            const cleanup = () => {
                cancelAnimationFrame(frame);
                window.removeEventListener('resize', resize);
                window.removeEventListener('pageshow', restore);
                document.removeEventListener('keydown', keydown);
                document.removeEventListener('visibilitychange', visible);
                motion.removeEventListener('change', changeMotion);
                inert.forEach(([element, value]) => { element.inert = value; });
                overlay.remove(); active = null; onReset?.();
                if (focus?.isConnected) focus.focus({ preventScroll: true });
            };
            const finish = () => {
                if (navigated) return;
                navigated = true; cancelAnimationFrame(frame);
                ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
                overlay.classList.add('is-black');
                try { sessionStorage.setItem(ARRIVAL_KEY, String(Date.now())); } catch { /* Navigation also works without storage. */ }
                window.location.assign(href);
            };
            const keydown = event => {
                if (event.key === 'Tab') event.preventDefault();
                if (event.key === 'Escape') { event.preventDefault(); cleanup(); }
            };
            const restore = event => { if (event.persisted) cleanup(); };
            const visible = () => { last = null; };
            const changeMotion = () => { if (motion.matches) { reduced = true; elapsed = .28; last = null; } };
            const animate = now => {
                if (navigated) return;
                if (!document.hidden && last !== null) elapsed += Math.max(0, (now - last) / 1000);
                last = now;
                if (now - painted < 1000 / 30) { frame = requestAnimationFrame(animate); return; }
                painted = now;
                try {
                    const phase = paintJourney(ctx, width, height, mapped, elapsed, reduced);
                    const stage = phase.black > 0 ? 'blackout' : !reduced && elapsed >= JOURNEY.eyes
                        ? 'eyes' : phase.door > 0 ? 'door' : 'shards';
                    if (overlay.dataset.phase !== stage) {
                        overlay.dataset.phase = stage;
                        if (stage === 'door') status.textContent = '光阶尽头，一扇门正在显现';
                        if (stage === 'blackout') status.textContent = '正在进入映相';
                    }
                    overlay.classList.toggle('is-black', phase.black >= 1);
                    if (phase.done) { finish(); return; }
                } catch { finish(); return; }
                frame = requestAnimationFrame(animate);
            };

            active = { cleanup };
            resize(); document.body.append(overlay);
            inert.forEach(([element]) => { element.inert = true; });
            document.addEventListener('keydown', keydown);
            document.addEventListener('visibilitychange', visible);
            window.addEventListener('resize', resize);
            window.addEventListener('pageshow', restore);
            motion.addEventListener('change', changeMotion);
            overlay.focus({ preventScroll: true });
            paintJourney(ctx, width, height, mapped, 0, reduced);
            frame = requestAnimationFrame(animate);
            return true;
        }
    };
}

if (typeof window !== 'undefined') installJourney();
