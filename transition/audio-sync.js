(() => {
    const bpm = Object.freeze({ stairs: 114, calendar: 227 });
    const defaults = Object.freeze({ stairs: -263, calendar: -36 });
    const key = track => `yinhu.audio-sync.${track}.v2`;
    const limit = track => Math.floor(30000 / bpm[track]);

    function clamp(track, offset) {
        const value = Number(offset);
        const bound = limit(track);
        return Number.isFinite(value) ? Math.max(-bound, Math.min(bound, Math.round(value))) : 0;
    }

    function read(track) {
        try {
            const saved = localStorage.getItem(key(track));
            return saved === null ? defaults[track] : clamp(track, saved);
        } catch { return defaults[track]; }
    }

    function write(track, offset) {
        try { localStorage.setItem(key(track), String(clamp(track, offset))); return true; }
        catch { return false; }
    }

    globalThis.YinhuAudioSync = Object.freeze({ bpm, limit, read, write });
})();
