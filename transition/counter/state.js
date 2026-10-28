(() => {
    'use strict';
    if (globalThis.BlackDoorCounter) return;

    // A new cloud deployment must not replay an older origin's offline increments.
    const cloud = globalThis.BLACKDOOR_CONFIG?.shared === true;
    const cacheKey = cloud ? 'blackdoor.counter.cloud.value.v1' : 'blackdoor.counter.value.v2';
    const pendingPrefix = cloud ? 'blackdoor.counter.cloud.increment.v1.' : 'blackdoor.counter.increment.v1.';
    const validValue = value => typeof value === 'string' && /^(0|[1-9]\d{0,29})$/.test(value);
    const validId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    let storage;
    try { storage = localStorage; } catch { /* Shared storage still works when browser storage is blocked. */ }
    let confirmed = 0n;
    let pending = new Map();
    let ready = false;
    let flushing = false;
    let reading = false;
    let revision = 0;
    let error = null;
    const listeners = new Set();
    const volatile = new Set();
    const acknowledged = new Set();

    function readCache() {
        try {
            const value = storage?.getItem(cacheKey);
            if (validValue(value) && BigInt(value) > confirmed) confirmed = BigInt(value);
        } catch { /* A failed cache read must not prevent server access. */ }
    }

    function readPending() {
        if (!storage) return;
        try {
            const loaded = new Map();
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                if (!key?.startsWith(pendingPrefix)) continue;
                const id = key.slice(pendingPrefix.length);
                if (validId(id) && !acknowledged.has(id)) loaded.set(id, Number(storage.getItem(key)) || 0);
            }
            for (const id of volatile) loaded.set(id, pending.get(id) || 0);
            pending = new Map([...loaded].sort((a, b) => a[1] - b[1]));
        } catch { /* Keep the in-memory queue if storage becomes unavailable. */ }
    }

    function snapshot() {
        return Object.freeze({ value: String(confirmed + BigInt(pending.size)), pending: pending.size,
            ready, error, durable: volatile.size === 0 });
    }

    function publish() {
        const state = snapshot();
        for (const listener of listeners) listener(state);
    }

    function accept(value, authoritative = false) {
        if (!validValue(value)) throw new Error('计数同步结果无效。');
        if (authoritative) confirmed = BigInt(value);
        else {
            if (BigInt(value) > confirmed) confirmed = BigInt(value);
            readCache();
        }
        try { storage?.setItem(cacheKey, String(confirmed)); } catch { /* Server remains authoritative. */ }
        ready = true;
        error = null;
    }

    async function request(path, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const base = globalThis.BLACKDOOR_CONFIG?.apiBase;
            const target = base ? `${base.replace(/\/$/, '')}${path}` : path;
            const response = await fetch(target, { ...options, cache: 'no-store', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', ...(globalThis.BLACKDOOR_CONFIG?.publicApiKey ? { apikey: globalThis.BLACKDOOR_CONFIG.publicApiKey } : {}), ...options.headers }, signal: controller.signal });
            if (!response.ok) throw new Error('暂时无法连接共享计数。');
            const result = await response.json();
            if (!validValue(result.value)) throw new Error('计数同步结果无效。');
            return result;
        } finally { clearTimeout(timeout); }
    }

    async function refresh() {
        if (reading || flushing) return;
        reading = true;
        const started = revision;
        try {
            const result = await request('/api/counter');
            // A late read must not overtake a local increment or its acknowledgement.
            if (started === revision) accept(result.value, true);
        } catch (failure) { error = failure.message; }
        finally { reading = false; publish(); }
    }

    async function flush() {
        if (flushing) return;
        readPending();
        if (!pending.size) return;
        flushing = true;
        try {
            while (pending.size) {
                const id = pending.keys().next().value;
                const result = await request('/api/counter/increments', {
                    method: 'POST', body: JSON.stringify({ id }), keepalive: true
                });
                if (result.id !== id) throw new Error('计数操作确认无效。');
                acknowledged.add(id);
                volatile.delete(id);
                pending.delete(id);
                try { storage?.removeItem(pendingPrefix + id); } catch { /* Retries remain idempotent. */ }
                revision += 1;
                accept(result.value);
                readPending();
                publish();
            }
        } catch (failure) { error = failure.message; }
        finally { flushing = false; publish(); }
    }

    function newId() {
        if (crypto.randomUUID) return crypto.randomUUID();
        // getRandomValues also works in an HTTP preview opened from a phone on the LAN.
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = bytes[6] & 15 | 64;
        bytes[8] = bytes[8] & 63 | 128;
        const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    function increment() {
        const id = newId();
        const timestamp = Date.now();
        pending.set(id, timestamp);
        try {
            if (!storage) throw new Error('storage unavailable');
            storage.setItem(pendingPrefix + id, String(timestamp));
        } catch { volatile.add(id); }
        revision += 1;
        publish();
        void flush();
        return id;
    }

    function sync() {
        readCache();
        readPending();
        publish();
        if (pending.size) void flush();
        else void refresh();
    }

    readCache();
    readPending();
    globalThis.BlackDoorCounter = Object.freeze({ increment, refresh: sync,
        get value() { return snapshot().value; },
        subscribe(listener) {
            listeners.add(listener);
            listener(snapshot());
            return () => listeners.delete(listener);
        }
    });

    window.addEventListener('storage', event => {
        if (event.key === cacheKey || event.key?.startsWith(pendingPrefix)) sync();
    });
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('pageshow', sync);
    window.addEventListener('pagehide', () => { void flush(); });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) sync();
    });
    setInterval(() => { if (!document.hidden) sync(); }, 3000);
    sync();
})();
