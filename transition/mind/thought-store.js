import { createSharedRecords } from '../../src/shared-records.js';
import { sharedCloudEnabled } from '../../src/api-url.js';

export const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function validateThought({ name, description = '', position, image = null }) {
    const trimmedName = String(name ?? '').trim();
    if (!trimmedName) throw new Error('请填写思维名称。');
    if (!position || !['x', 'y', 'z'].every(axis =>
        typeof position[axis] === 'number' && Number.isFinite(position[axis]))) {
        throw new Error('请填写有效的 X、Y、Z 坐标。');
    }
    if (image && (!IMAGE_TYPES.has(image.type) || image.size > MAX_IMAGE_BYTES || !image.size)) {
        throw new Error('请选择不超过 10 MiB 的 PNG、JPEG 或 WebP 图片。');
    }
    return { name: trimmedName, description: String(description).trim(),
        position: { x: position.x, y: position.y, z: position.z }, image };
}

// Persist first: a failed transaction must never create a card or a phantom leaf.
export function createThoughtRepository(storage) {
    let records = [];
    let revision = 0;
    return {
        get records() { return records; },
        async load() {
            const before = revision;
            const next = (await storage.list()).sort((a, b) => a.createdAt - b.createdAt);
            if (before === revision) records = next;
            return records;
        },
        async add(input) {
            const record = { ...validateThought(input), id: crypto.randomUUID(), createdAt: Date.now(), equipped: false };
            const stored = await storage.put(record);
            const saved = stored && typeof stored === 'object' ? stored : record;
            revision += 1;
            records = [...records, saved];
            return saved;
        },
        async setEquipped(id, equipped) {
            const record = records.find(item => item.id === id);
            if (!record) throw new Error('找不到这条思维。');
            if (record.equipped === equipped) return record;
            const updated = { ...record, equipped };
            const stored = await storage.put(updated);
            const saved = stored && typeof stored === 'object' ? stored : updated;
            revision += 1;
            records = records.map(item => item.id === id ? saved : item);
            return saved;
        }
    };
}

export function openThoughtStorage(indexedDB = globalThis.indexedDB) {
    if (sharedCloudEnabled()) {
        const cloud = createSharedRecords('thoughts', { fileField: 'image', normalize: input => ({
            ...validateThought(input), equipped: input.equipped === true
        }) });
        // IDs for new cloud records are assigned by the server, not copied from local storage.
        const known = new Set();
        return Promise.resolve({
            async list() { const rows = await cloud.list(); for (const row of rows) known.add(row.id); return rows; },
            async put(record) { const saved = await cloud.put({ ...record, id: known.has(record.id) ? record.id : undefined }); known.add(saved.id); return saved; },
            close() {}
        });
    }
    return new Promise((resolve, reject) => {
        if (!indexedDB) { reject(new Error('当前浏览器无法使用本地数据库。')); return; }
        const request = indexedDB.open('blackdoor-mind', 1);
        let settled = false;
        request.onupgradeneeded = () => request.result.createObjectStore('thoughts', { keyPath: 'id' });
        request.onerror = () => { settled = true; reject(request.error); };
        request.onblocked = () => { settled = true; reject(new Error('本地数据库被其他页面占用，请关闭旧页面后刷新。')); };
        request.onsuccess = () => {
            const db = request.result;
            if (settled) { db.close(); return; }
            db.onversionchange = () => db.close();
            function transact(mode, operation) {
                return new Promise((done, fail) => {
                    const transaction = db.transaction('thoughts', mode);
                    const result = operation(transaction.objectStore('thoughts'));
                    transaction.oncomplete = () => done(result.result);
                    transaction.onabort = () => fail(transaction.error || new Error('本地保存失败。'));
                    transaction.onerror = () => {}; // onabort carries the final transaction failure.
                });
            }
            resolve({ list: () => transact('readonly', store => store.getAll()),
                put: record => transact('readwrite', store => store.put(record)), close: () => db.close() });
        };
    });
}
