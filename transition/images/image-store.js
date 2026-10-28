import { createSharedRecords } from '../../src/shared-records.js';
import { sharedCloudEnabled } from '../../src/api-url.js';

export const MAX_COVER_BYTES = 12 * 1024 * 1024;
export const COVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
export const FRAME_LIMITS = Object.freeze({ minWidth: 80, maxWidth: 640, minHeight: 64, maxHeight: 440, minY: 40, bottom: 520 });
// Kept only for reading windows saved before freehand window drawing was introduced.
export const WINDOW_SIZES = new Set(['small', 'medium', 'large']);
const LEGACY_FRAMES = {
    small: { width: 112, height: 126, y: 180 },
    medium: { width: 184, height: 188, y: 150 },
    large: { width: 169, height: 292, y: 102 }
};

/** Store custom window geometry in scene units, independently of the viewport size. */
export function normalizeFrame(frame) {
    const { width, height, y } = frame ?? {};
    if (![width, height, y].every(value => typeof value === 'number' && Number.isFinite(value)) ||
        width < FRAME_LIMITS.minWidth || width > FRAME_LIMITS.maxWidth ||
        height < FRAME_LIMITS.minHeight || height > FRAME_LIMITS.maxHeight ||
        y < FRAME_LIMITS.minY || y + height > FRAME_LIMITS.bottom) {
        throw new Error('Draw a valid window within the drawing area: width 80–640, height 64–440.');
    }
    const rounded = value => Math.round(value * 10) / 10;
    const normalizedHeight = rounded(height);
    return {
        width: rounded(width),
        height: normalizedHeight,
        // Independent rounding at the lower edge must not move the frame outside the scene.
        y: Math.min(rounded(y), rounded(FRAME_LIMITS.bottom - normalizedHeight))
    };
}

function calendarDate(value) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;
    if (!parsed || !Number.isFinite(parsed.getTime()) || value.startsWith('0000-') || parsed.toISOString().slice(0, 10) !== value) {
        throw new Error('Enter a valid date.');
    }
    return value;
}

/** Accept a single date or a dotted date range without ambiguous Date parsing. */
export function parseWindowTime(value) {
    const source = typeof value === 'string' ? value.trim() : '';
    const match = /^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:\s*[-–—~～至]\s*(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2}))?$/.exec(source);
    if (!match) throw new Error('Enter a valid date or date range.');
    const dateAt = index => calendarDate(`${match[index]}-${match[index + 1].padStart(2, '0')}-${match[index + 2].padStart(2, '0')}`);
    const date = dateAt(1), dateEnd = match[4] ? dateAt(4) : '';
    if (dateEnd && dateEnd < date) throw new Error('The end date cannot be before the start date.');
    return { date, dateEnd };
}

export function formatWindowTime(record) {
    const dotted = value => value.split('-').map((part, index) => index ? String(Number(part)) : part).join('.');
    return `${dotted(record.date)}${record.dateEnd ? `-${dotted(record.dateEnd)}` : ''}`;
}

/** Validate fields before opening a transaction; identifiers and timestamps belong to the store. */
export function normalizeWindow(input = {}) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title || [...title].length > 40) throw new Error('Enter a window title of 1–40 characters.');
    const date = typeof input.date === 'string' ? input.date : '';
    calendarDate(date);
    const dateEnd = typeof input.dateEnd === 'string' ? input.dateEnd : '';
    if (dateEnd) calendarDate(dateEnd);
    if (dateEnd && dateEnd < date) throw new Error('The end date cannot be before the start date.');
    const material = typeof input.material === 'string' ? input.material.trim() : '';
    if ([...material].length > 600) throw new Error('Material description must be 600 characters or fewer.');
    const frame = normalizeFrame(input.frame === undefined ? LEGACY_FRAMES[input.size] : input.frame);
    const cover = input.cover ?? null;
    if (cover !== null && (!(cover instanceof Blob) || !COVER_TYPES.has(cover.type) || !cover.size || cover.size > MAX_COVER_BYTES)) {
        throw new Error('Choose a JPEG, PNG, WebP, GIF or AVIF image up to 12 MiB.');
    }
    return { title, date, dateEnd, material, frame, cover };
}

function storageError(error, action = 'access') {
    let message = `Could not ${action} local images. Allow local storage for this site and try again.`;
    if (error?.name === 'QuotaExceededError') message = 'Not enough local storage. Free up browser storage or choose a smaller cover and try again.';
    if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') message = 'The browser blocked local image storage. Allow storage for this site or use a regular browsing window.';
    if (error?.name === 'VersionError') message = 'The image database has been updated. Close this page and reload to try again.';
    return new Error(message, { cause: error });
}

function validID(id) {
    if (typeof id !== 'string' || !id.trim()) throw new Error('Window ID not found. Reload the page and try again.');
    return id;
}

/** Browser-only IndexedDB repository. Dependency injection keeps persistence tests independent of UI. */
export function createImageStore({ indexedDB = globalThis.indexedDB, randomUUID = () => globalThis.crypto.randomUUID(), now = Date.now } = {}) {
    let connection;
    function open() {
        if (connection) return connection;
        connection = new Promise((resolve, reject) => {
            if (!indexedDB) {
                reject(new Error('Local image storage is unavailable. Use a browser that supports IndexedDB and allow local storage.'));
                return;
            }
            let request;
            let settled = false;
            try { request = indexedDB.open('blackdoor-images', 1); }
            catch (error) { reject(storageError(error)); return; }
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains('windows')) request.result.createObjectStore('windows', { keyPath: 'id' });
            };
            request.onerror = () => { settled = true; reject(storageError(request.error)); };
            request.onblocked = () => {
                settled = true;
                reject(new Error('Another page is using the image database. Close other image pages and reload.'));
            };
            request.onsuccess = () => {
                const db = request.result;
                if (settled) { db.close(); return; }
                db.onversionchange = () => { db.close(); connection = undefined; };
                db.onclose = () => { connection = undefined; };
                resolve(db);
            };
        }).catch(error => { connection = undefined; throw error; });
        return connection;
    }

    async function transact(mode, operation) {
        const db = await open();
        return new Promise((resolve, reject) => {
            let transaction;
            let result;
            let failure;
            try {
                transaction = db.transaction('windows', mode);
                transaction.oncomplete = () => resolve(result);
                transaction.onabort = () => reject(failure || storageError(transaction.error, mode === 'readwrite' ? 'save' : 'read'));
                transaction.onerror = () => {}; // Wait for rollback before reporting failure.
                operation(transaction.objectStore('windows'), value => { result = value; }, error => {
                    failure = error;
                    transaction.abort();
                });
            } catch (error) {
                if (transaction) {
                    try { transaction.abort(); } catch { /* Already finished. */ }
                }
                reject(storageError(error));
            }
        });
    }

    return {
        listWindows() {
            return transact('readonly', (store, complete, fail) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    try {
                        const records = request.result.map(record => ({ ...record, ...normalizeWindow(record) }));
                        complete(records.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt || a.id.localeCompare(b.id)));
                    } catch (error) { fail(error); }
                };
            });
        },
        saveWindow(input) {
            // Validation failures are promises too, matching database failures for UI callers.
            return Promise.resolve().then(() => {
                const fields = normalizeWindow(input);
                const id = input.id == null ? null : validID(input.id);
                let newID;
                if (!id) {
                    try { newID = randomUUID(); }
                    catch { throw new Error('A window ID could not be generated. Open Images using HTTPS or localhost.'); }
                }
                return transact('readwrite', (store, complete, fail) => {
                    const put = record => {
                        const request = store.put(record);
                        request.onsuccess = () => complete(record);
                    };
                    if (!id) { put({ ...fields, id: newID, createdAt: now() }); return; }
                    const request = store.get(id);
                    request.onsuccess = () => {
                        if (!request.result) { fail(new Error('This window has been removed. Reload the page and create a new one.')); return; }
                        put({ ...fields, id, createdAt: request.result.createdAt });
                    };
                });
            });
        },
        deleteWindow(id) {
            return Promise.resolve().then(() => {
                validID(id);
                return transact('readwrite', store => { store.delete(id); });
            });
        }
    };
}

let defaultStore;
export function createSharedImageStore() {
    const cloud = createSharedRecords('windows', { fileField: 'cover', normalize: normalizeWindow });
    return { listWindows: () => cloud.list(), saveWindow: input => cloud.put(input), deleteWindow: id => cloud.remove(id) };
}
// Cloud mode never opens the existing IndexedDB or imports its records.
const repository = () => defaultStore ??= sharedCloudEnabled() ? createSharedImageStore() : createImageStore();
export const listWindows = () => repository().listWindows();
export const saveWindow = record => repository().saveWindow(record);
export const deleteWindow = id => repository().deleteWindow(id);

/** Call URL.revokeObjectURL(url) when the matching cover is removed or replaced. */
export function imageURL(record) {
    return record?.cover ? URL.createObjectURL(record.cover) : null;
}
