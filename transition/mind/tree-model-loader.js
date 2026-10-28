// Download fingerprinted static parts in parallel, then decode the same GLB.
// No browser records, images or other local data are read or transmitted here.
export async function fetchTreeModelParts(manifest, onProgress = () => {}, fetcher = globalThis.fetch) {
    const parts = manifest?.parts;
    if (!Array.isArray(parts) || !parts.length || parts.length > 32
        || !Number.isSafeInteger(manifest.byteLength) || manifest.byteLength <= 0
        || manifest.byteLength > 256 * 1024 * 1024) throw new Error('Invalid tree model manifest.');
    let total = 0;
    const offsets = parts.map(part => {
        if (!/^\/(?:[A-Za-z0-9._-]+\/)*assets\/models\/tree-[a-f0-9]{12}-part-\d+\.bin$/.test(part.url) || part.url.split('/').some(piece => piece === '.' || piece === '..')
            || !Number.isSafeInteger(part.byteLength) || part.byteLength <= 0
            || part.byteLength > 8 * 1024 * 1024 || !/^sha256-[A-Za-z0-9+/]{43}=$/.test(part.integrity)) {
            throw new Error('Invalid tree model part.');
        }
        const offset = total;
        total += part.byteLength;
        return offset;
    });
    if (total !== manifest.byteLength) throw new Error('Tree model size mismatch.');
    const bytes = new Uint8Array(total);
    const controller = new AbortController();
    let next = 0, loaded = 0;
    const progress = () => onProgress({ loaded, total, lengthComputable: true });
    progress();
    async function download() {
        while (next < parts.length) {
            const index = next++;
            const part = parts[index];
            const response = await fetcher(part.url, {
                credentials: 'same-origin', integrity: part.integrity, signal: controller.signal
            });
            if (!response.ok || !response.body) throw new Error(`Tree part failed: HTTP ${response.status}`);
            const reader = response.body.getReader();
            let received = 0;
            try {
                while (true) {
                    const {done,value} = await reader.read();
                    if (done) break;
                    if (received + value.byteLength > part.byteLength) throw new Error('Tree part exceeds expected size.');
                    bytes.set(value,offsets[index] + received);
                    received += value.byteLength;
                    loaded += value.byteLength;
                    progress();
                }
                if (received !== part.byteLength) throw new Error('Incomplete tree model part.');
            } finally {
                reader.releaseLock();
            }
        }
    }
    try {
        await Promise.all(Array.from({length:Math.min(3,parts.length)},download));
    } catch (error) {
        controller.abort();
        throw error;
    }
    return bytes.buffer;
}
