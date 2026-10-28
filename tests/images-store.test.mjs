import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageStore, normalizeWindow, normalizeFrame, FRAME_LIMITS, MAX_COVER_BYTES, imageURL, parseWindowTime, formatWindowTime } from '../transition/images/image-store.js';

const input = { title: '  海边的某一天  ', date: '2024-02-29', frame: { width: 307.2, height: 173.6, y: 133.4 }, cover: new Blob(['photo'], { type: 'image/jpeg' }) };

// Minimal transactional IndexedDB double: writes commit only after all requests succeed.
function memoryIndexedDB(initialRecords = []) {
    const records = new Map(initialRecords.map(record => [record.id, structuredClone(record)]));
    let failure = null;
    const api = {
        failNext(error) { failure = error; },
        open(name, version) {
            assert.equal(name, 'blackdoor-images');
            assert.equal(version, 1);
            const request = {};
            const db = {
                close() {},
                objectStoreNames: { contains: () => true },
                transaction(storeName, mode) {
                    assert.equal(storeName, 'windows');
                    const draft = new Map(records);
                    let pending = 0;
                    let aborted = false;
                    let finish;
                    const transaction = {
                        abort() {
                            if (aborted) return;
                            aborted = true;
                            clearImmediate(finish);
                            queueMicrotask(() => transaction.onabort?.());
                        },
                        objectStore() { return store; }
                    };
                    function schedule() {
                        clearImmediate(finish);
                        finish = setImmediate(() => {
                            if (aborted || pending) return;
                            if (mode === 'readwrite') {
                                records.clear();
                                for (const [key, record] of draft) records.set(key, record);
                            }
                            transaction.oncomplete?.();
                        });
                    }
                    function perform(operation) {
                        const result = {};
                        pending++;
                        queueMicrotask(() => {
                            if (aborted) return;
                            if (failure) {
                                transaction.error = failure;
                                failure = null;
                                transaction.abort();
                                return;
                            }
                            result.result = operation();
                            pending--;
                            result.onsuccess?.();
                            schedule();
                        });
                        return result;
                    }
                    const store = {
                        getAll: () => perform(() => structuredClone([...draft.values()])),
                        get: id => perform(() => structuredClone(draft.get(id))),
                        put: record => perform(() => { draft.set(record.id, structuredClone(record)); return record.id; }),
                        delete: id => perform(() => draft.delete(id))
                    };
                    schedule();
                    return transaction;
                }
            };
            queueMicrotask(() => { request.result = db; request.onsuccess?.(); });
            return request;
        }
    };
    return api;
}

test('validates real calendar dates, bounded titles, custom frames and image blobs', () => {
    assert.equal(normalizeWindow(input).title, '海边的某一天');
    assert.deepEqual(normalizeWindow(input).frame, input.frame);
    assert.equal(Object.hasOwn(normalizeWindow(input), 'size'), false);
    assert.equal(normalizeWindow({ ...input, cover: undefined }).cover, null);
    for (const date of ['2023-02-29', '2024-04-31', '2024-13-01', '2024-2-01', '0000-01-01', '', 'not a date']) {
        assert.throws(() => normalizeWindow({ ...input, date }), /date/);
    }
    for (const title of ['', '   ', '影'.repeat(41), null]) assert.throws(() => normalizeWindow({ ...input, title }), /title/);
    assert.throws(() => normalizeWindow({ ...input, frame: undefined }), /window/);
    for (const cover of [new Blob(['svg'], { type: 'image/svg+xml' }), new Blob([], { type: 'image/png' }), { type: 'image/png', size: 3 }, new Blob([new Uint8Array(MAX_COVER_BYTES + 1)], { type: 'image/jpeg' })]) {
        assert.throws(() => normalizeWindow({ ...input, cover }), /12 MiB/);
    }
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']) {
        assert.equal(normalizeWindow({ ...input, cover: new Blob(['ok'], { type }) }).cover.type, type);
    }
});

test('custom frames are finite, bounded to the drawing scene and normalized to one decimal', () => {
    assert.deepEqual(FRAME_LIMITS, { minWidth: 80, maxWidth: 640, minHeight: 64, maxHeight: 440, minY: 40, bottom: 520 });
    assert.deepEqual(normalizeFrame({ width: 307.24, height: 173.64, y: 133.36 }), input.frame);
    assert.deepEqual(normalizeFrame({ width: 80, height: 64, y: 456 }), { width: 80, height: 64, y: 456 });
    assert.deepEqual(normalizeFrame({ width: 640, height: 440, y: 80 }), { width: 640, height: 440, y: 80 });
    const roundedAtEdge = normalizeFrame({ width: 100.05, height: 100.05, y: 419.95 });
    assert.ok(roundedAtEdge.y + roundedAtEdge.height <= FRAME_LIMITS.bottom);
    for (const frame of [
        null, {}, { ...input.frame, width: '100' },
        ...[NaN, Infinity, -Infinity].flatMap(value => ['width', 'height', 'y'].map(key => ({ ...input.frame, [key]: value }))),
        { ...input.frame, width: 79.99 }, { ...input.frame, width: 640.01 },
        { ...input.frame, height: 63.99 }, { ...input.frame, height: 440.01 },
        { ...input.frame, y: 39.99 }, { width: 100, height: 100, y: 420.01 }
    ]) assert.throws(() => normalizeFrame(frame), /valid window/);
});

test('committed windows keep exact custom dimensions, covers, ordering and creation time after editing and reload', async () => {
    const indexedDB = memoryIndexedDB();
    let identifier = 0;
    let clock = 100;
    const store = createImageStore({ indexedDB, randomUUID: () => `window-${++identifier}`, now: () => ++clock });
    const first = await store.saveWindow(input);
    const second = await store.saveWindow({ ...input, title: '春天', date: '2023-03-01' });
    const third = await store.saveWindow({ ...input, title: '另一个闰日' });
    const reopened = createImageStore({ indexedDB });
    assert.deepEqual((await reopened.listWindows()).map(record => record.id), [second.id, first.id, third.id]);
    assert.equal(await (await reopened.listWindows())[1].cover.text(), 'photo');
    assert.deepEqual((await reopened.listWindows())[1].frame, input.frame);
    const nextFrame = { width: 520.1, height: 400.2, y: 80.3 };
    const edited = await reopened.saveWindow({ ...first, title: '  再看一次  ', frame: nextFrame, createdAt: 900, cover: null });
    assert.equal(edited.title, '再看一次');
    assert.equal(edited.createdAt, 101);
    assert.equal(edited.cover, null);
    const reloaded = (await createImageStore({ indexedDB }).listWindows()).find(record => record.id === first.id);
    assert.deepEqual(reloaded.frame, nextFrame);
    assert.equal(reloaded.createdAt, 101);
    await reopened.deleteWindow(second.id);
    assert.equal((await reopened.listWindows()).length, 2);
    await assert.rejects(reopened.saveWindow({ ...input, id: 'deleted' }), /removed/);
    await assert.rejects(reopened.saveWindow({ ...input, frame: undefined }), /valid window/);
});

test('version 1 windows with legacy size names remain readable and editable without resetting storage', async () => {
    const legacyFrames = {
        small: { width: 112, height: 126, y: 180 },
        medium: { width: 184, height: 188, y: 150 },
        large: { width: 169, height: 292, y: 102 }
    };
    const legacyRecords = Object.keys(legacyFrames).map((size, index) => {
        const { frame, ...fields } = input;
        return { ...fields, size, id: `legacy-${size}`, createdAt: index + 1 };
    });
    const indexedDB = memoryIndexedDB(legacyRecords);
    const store = createImageStore({ indexedDB });
    const records = await store.listWindows();
    assert.equal(records.length, 3);
    for (const record of records) {
        assert.deepEqual(record.frame, legacyFrames[record.size]);
        assert.equal(await record.cover.text(), 'photo');
        assert.deepEqual(normalizeWindow(legacyRecords.find(saved => saved.id === record.id)).frame, record.frame);
    }
    const edited = await store.saveWindow({ ...records[0], title: '旧窗口的新名字' });
    assert.equal(edited.createdAt, 1);
    assert.deepEqual(edited.frame, legacyFrames.small);
    assert.equal(Object.hasOwn(edited, 'size'), false);
    assert.deepEqual((await createImageStore({ indexedDB }).listWindows())[0].frame, legacyFrames.small);
});

test('quota failures report failure and do not create phantom saved windows', async () => {
    const indexedDB = memoryIndexedDB();
    const store = createImageStore({ indexedDB, randomUUID: () => 'first' });
    const original = await store.saveWindow(input);
    indexedDB.failNext(Object.assign(new Error('quota'), { name: 'QuotaExceededError' }));
    await assert.rejects(store.saveWindow({ ...original, title: '未保存' }), /Not enough local storage/);
    assert.equal((await store.listWindows())[0].title, original.title);
    indexedDB.failNext(Object.assign(new Error('denied'), { name: 'SecurityError' }));
    await assert.rejects(store.deleteWindow(original.id), /blocked/);
    assert.equal((await store.listWindows()).length, 1);
    await assert.rejects(createImageStore({ indexedDB: null }).listWindows(), /IndexedDB/);
});

test('cover URL is explicit and releasable', () => {
    assert.equal(imageURL({ cover: null }), null);
    const url = imageURL(input);
    assert.ok(url.startsWith('blob:'));
    URL.revokeObjectURL(url);
});

test('date ranges accept dotted dates, retain real calendar validation and sort by their start', () => {
    assert.deepEqual(parseWindowTime('2022.1.2-2022.3.4'), { date: '2022-01-02', dateEnd: '2022-03-04' });
    assert.deepEqual(parseWindowTime(' 2024-02-29 — 2025-03-01 '), { date: '2024-02-29', dateEnd: '2025-03-01' });
    assert.deepEqual(parseWindowTime('2024.2.29'), { date: '2024-02-29', dateEnd: '' });
    assert.equal(formatWindowTime({ date: '2022-01-02', dateEnd: '2022-03-04' }), '2022.1.2-2022.3.4');
    assert.equal(formatWindowTime(input), '2024.2.29');
    for (const time of ['2023.2.29', '2024.4.31-2024.5.1', '2022.3.4-2022.1.2', '', '2024.1.1-2024.13.1', '0000.1.1']) {
        assert.throws(() => parseWindowTime(time), /date/);
    }
    assert.throws(() => normalizeWindow({ ...input, dateEnd: '2024-02-28' }), /end date/);
});

test('date range and multiline material introduction survive save, edit and reload', async () => {
    const indexedDB = memoryIndexedDB();
    const store = createImageStore({ indexedDB, randomUUID: () => 'artwork' });
    const saved = await store.saveWindow({ ...input, ...parseWindowTime('2022.1.2-2022.3.4'), material: '  一次旅行\n一些沿途的光。  ' });
    assert.equal(saved.material, '一次旅行\n一些沿途的光。');
    assert.equal(saved.dateEnd, '2022-03-04');
    const loaded = (await createImageStore({ indexedDB }).listWindows())[0];
    assert.equal(loaded.material, saved.material);
    assert.equal(formatWindowTime(loaded), '2022.1.2-2022.3.4');
    const edited = await store.saveWindow({ ...loaded, title: '沿途' });
    assert.equal(edited.dateEnd, saved.dateEnd);
    assert.equal(edited.material, saved.material);
    assert.equal(normalizeWindow(input).material, '');
    assert.throws(() => normalizeWindow({ ...input, material: '字'.repeat(601) }), /600/);
});
