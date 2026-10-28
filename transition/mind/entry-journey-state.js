export const ENTRY_KEY = 'blackdoor.mind.journey.v2';
export const clamp01 = value => Math.max(0, Math.min(1, value));
export const smooth = (start, end, value) => {
    const t = clamp01((value - start) / (end - start));
    return t * t * (3 - 2 * t);
};

// Readiness starts the final act; downloading/parsing never gets a fake deadline.
// A cached tree still gets enough time for the vines and forest to take shape.
export function createJourneyClock({ reducedMotion = false } = {}) {
    const scale = reducedMotion ? 0.58 : 1;
    let elapsed = 0;
    let finishAt = null;
    let settled = false;
    return {
        settle() { settled = true; },
        advance(delta) {
            elapsed += Math.max(0, Math.min(delta, 0.1));
            if (settled && finishAt === null) finishAt = Math.max(9 * scale, elapsed);
            const ending = finishAt === null ? 0 : Math.max(0, elapsed - finishAt) / scale;
            const t = elapsed / scale;
            return {
                elapsed, time: t, ending,
                vines: smooth(0.3, 3.4, t),
                space: smooth(2.8, 5.2, t),
                growth: smooth(4, 8.8, t),
                fold: smooth(6, 10, t),
                gold: smooth(0, 3.2, ending),
                burst: smooth(3.1, 5.2, ending),
                reveal: smooth(5.3, 6.5, ending),
                done: ending >= 6.5,
                waiting: finishAt === null && t >= 9
            };
        }
    };
}

export function seededRandom(seed = 0x451eab) {
    let state = seed >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let t = state;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

export function trackAt(distance) {
    return {
        x: Math.sin(distance * 0.036) * 5.8 + Math.sin(distance * 0.081) * 1.7,
        y: Math.sin(distance * 0.045 + 0.6) * 2.5 + Math.sin(distance * 0.092) * 0.9
    };
}

export function readJourney(storage, now = Date.now()) {
    try {
        const raw = storage.getItem(ENTRY_KEY);
        storage.removeItem(ENTRY_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (!Number.isFinite(value.created) || now - value.created > 30000 || now < value.created) return null;
        if (![value.x, value.y, value.radius].every(Number.isFinite)) return null;
        return { x: clamp01(value.x), y: clamp01(value.y), radius: Math.min(0.2, Math.max(0.015, value.radius)) };
    } catch { return null; }
}
