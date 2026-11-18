export const ENTRY_KEY = 'blackdoor.mind.journey.v2';
export const clamp01 = value => Math.max(0, Math.min(1, value));
export const smooth = (start, end, value) => {
    const t = clamp01((value - start) / (end - start));
    return t * t * (3 - 2 * t);
};

// Mist and grace have their own clock. Only the final tree reveal waits for
// downloading/parsing, so they remain visible throughout a slow model load.
export function createJourneyClock({ reducedMotion = false } = {}) {
    const scale = reducedMotion ? 0.58 : 1;
    let elapsed = 0;
    let finishAt = null;
    let settled = false;
    return {
        settle() { settled = true; },
        advance(delta) {
            elapsed += Math.max(0, Math.min(delta, 0.1));
            if (settled && finishAt === null) finishAt = Math.max(10.2 * scale, elapsed);
            const ending = finishAt === null ? 0 : Math.max(0,elapsed-finishAt)/scale;
            const t = elapsed / scale;
            return {
                elapsed, time: t, ending,
                vines: smooth(0.2, 2.9, t),
                dissolve: smooth(2.7,5.9,t),
                mist: smooth(3.6,6.8,t),
                grace: smooth(4.8,8.8,t),
                tree: smooth(0,2.8,ending),
                done: ending >= 3.1,
                waiting: finishAt === null && t >= 10.2
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
