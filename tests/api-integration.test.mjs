import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from '../hosting/node_modules/miniflare/dist/src/index.js';
import { WORKSPACE_ID } from '../hosting/lib/blackdoor-api.mjs';
import { importLegacyCalendar } from '../src/legacy-calendar.js';

let runtime, env, runtimeOptions;
before(async () => {
  const api = await readFile(new URL('../hosting/lib/blackdoor-api.mjs', import.meta.url), 'utf8');
  runtimeOptions = { modules: [
    { type: 'ESModule', path: 'index.mjs', contents: 'import {handleBlackDoor} from "./api.mjs"; export default {fetch(request,env){return handleBlackDoor(request,env,{allowModelSetup:env.ALLOW_MODEL_SETUP === "1"})}};' },
    { type: 'ESModule', path: 'api.mjs', contents: api }
  ], bindings: { MODEL_SETUP_TOKEN: 'test-only', ALLOW_MODEL_SETUP: '1' },
    compatibilityDate: '2026-05-15', d1Databases: ['DB'], r2Buckets: ['BUCKET'], cf: false };
  runtime = new Miniflare(runtimeOptions);
  env = { DB: await runtime.getD1Database('DB'), BUCKET: await runtime.getR2Bucket('BUCKET') };
  const directory = new URL('../hosting/drizzle/', import.meta.url);
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(file, directory), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) await env.DB.prepare(statement.trim()).run();
    }
  }
});
after(async () => { await runtime?.dispose(); });
async function call(path, method = 'GET', data, headers = {}) {
  return runtime.dispatchFetch(`https://test.local${path}`, { method, headers,
    body: data === undefined ? undefined : data instanceof Uint8Array ? data : JSON.stringify(data) });
}
const read = async response => (await response).json();

test('shared counter persists, merges concurrent increments and deduplicates retries', async () => {
  const initial = await read(call('/api/counter'));
  assert.equal(initial.value, '0');
  const ids = Array.from({ length: 30 }, () => crypto.randomUUID());
  const responses = await Promise.all([...ids, ...ids.slice(0, 12)].map(id =>
    call('/api/counter/increments', 'POST', { id })));
  assert.ok(responses.every(response => response.status === 200));
  for (const response of responses) assert.match((await response.json()).value, /^\d+$/);
  const fresh = await call('/api/counter', 'GET', undefined, { 'User-Agent': 'another-device' });
  assert.equal((await fresh.json()).value, '30');
  assert.equal(fresh.headers.get('cache-control'), 'no-store');
  assert.equal((await read(call('/api/counter/increments', 'POST', { id: ids[0] }))).value, '30');
  assert.equal((await call('/api/counter/increments', 'POST', { id: 'invalid' })).status, 400);
  assert.equal((await call('/api/counter/increments', 'POST', { id: crypto.randomUUID(), value: 100 })).status, 400);
  assert.equal((await call('/api/counter', 'DELETE')).status, 405);
  assert.equal((await call('/api/counter?workspace=other')).status, 400);
});

test('shared counter preserves integer precision above the JavaScript safe range', async () => {
  await env.DB.prepare("UPDATE shared_counters SET value=9007199254740993 WHERE workspace_id=?").bind(WORKSPACE_ID).run();
  const result = await read(call('/api/counter/increments', 'POST', { id: crypto.randomUUID() }));
  assert.equal(result.value, '9007199254740994');
  assert.equal((await read(call('/api/counter'))).value, '9007199254740994');
});
test('anonymous persistence, concurrent versions, uniqueness, soft delete and restore', async () => {
  const response = await call('/api/calendar/day-notes', 'POST', { noteDate: '2026-10-15', content: '初始' });
  assert.equal(response.status, 201);
  const initial = await response.json();
  assert.equal(initial.workspace_id, WORKSPACE_ID); assert.equal(initial.created_by, 'shared');
  const edits = await Promise.all(['first', 'second'].map(content => call(`/api/calendar/day-notes/${initial.id}`, 'PATCH', { version: 1, content })));
  assert.deepEqual(edits.map(r => r.status).sort(), [200, 409]);
  assert.equal((await edits.find(r => r.status === 409).json()).remote.version, 2);
  assert.equal((await read(call('/api/calendar'))).dayNotes.length, 1);
  assert.equal((await call('/api/calendar/day-notes', 'POST', { noteDate: '2026-10-15', content: '重复' })).status, 409);
  const removed = await read(call(`/api/calendar/day-notes/${initial.id}`, 'DELETE', { version: 2 }));
  assert.equal(removed.version, 3); assert.equal(removed.deleted_by, 'shared');
  assert.equal((await read(call('/api/calendar'))).dayNotes.length, 0);
  assert.equal((await read(call('/api/calendar?includeDeleted=true'))).dayNotes.length, 1);
  const restored = await read(call(`/api/calendar/day-notes/${initial.id}/restore`, 'POST', { version: 3 }));
  assert.equal(restored.version, 4); assert.equal(restored.deleted_at, null);
  assert.equal((await call(`/api/calendar/day-notes/${initial.id}`, 'PATCH', { version: 1, content: '过期' })).status, 409);
});
test('input and resource validation', async () => {
  for (const [path, data, status] of [
    ['/day-notes', { noteDate: '2026-02-30', content: 'x' }, 400],
    ['/day-notes', { noteDate: '2026-10-16', content: 'x', workspace_id: 'other' }, 400],
    ['/journals', { startDate: '2026-10-15', endDate: '2026-10-16', periodKey: '2026-10-15', content: 'x' }, 400],
    ['/media_assets', {}, 404], ['/__proto__', {}, 404]
  ]) assert.equal((await call(`/api/calendar${path}`, 'POST', data)).status, status);
});
test('journal uniqueness, deleted record recreation and anniversary edits', async () => {
  const values = { periodKey: '2026-10-15~2026-10-17', startDate: '2026-10-15', endDate: '2026-10-17', content: '手记' };
  const created = await read(call('/api/calendar/journals', 'POST', values));
  assert.equal((await call('/api/calendar/journals', 'POST', values)).status, 409);
  await call(`/api/calendar/journals/${created.id}`, 'DELETE', { version: 1 });
  const recreated = await read(call('/api/calendar/journals', 'POST', { ...values, content: '恢复' }));
  assert.equal(recreated.id, created.id); assert.equal(recreated.version, 3);
  const annal = await read(call('/api/calendar/anniversaries', 'POST', { eventDate: '2026-10-15', title: '纪念' }));
  const updated = await read(call(`/api/calendar/anniversaries/${annal.id}`, 'PATCH', { version: annal.version, title: '新纪念', description: '说明' }));
  assert.equal(updated.description, '说明'); assert.equal(updated.version, 2);
});
test('media failure cleanup, retry, deletion recovery and model isolation', async () => {
  const asset = await read(call('/api/media', 'POST', { originalName: 'tree.glb', mimeType: 'text/html', sizeBytes: 3 }));
  assert.ok(asset.object_key.startsWith('user-media/'));
  assert.equal((await call(`/api/media/${asset.id}/content`)).status, 404);
  assert.equal((await call(`/api/media/${asset.id}/content`, 'PUT', new Uint8Array([1, 2]))).status, 400);
  assert.equal((await env.DB.prepare('SELECT status FROM media_assets WHERE id=?').bind(asset.id).first()).status, 'failed');
  assert.equal(await env.BUCKET.head(asset.object_key), null);
  const ready = await read(call(`/api/media/${asset.id}/content`, 'PUT', new Uint8Array([1, 2, 3])));
  assert.equal(ready.status, 'ready');
  const content = await call(`/api/media/${asset.id}/content`);
  assert.equal(content.headers.get('content-disposition'), 'attachment');
  assert.deepEqual(new Uint8Array(await content.arrayBuffer()), new Uint8Array([1, 2, 3]));
  assert.equal((await call(`/api/media/${asset.id}/content`, 'PUT', new Uint8Array([4, 5, 6]))).status, 409);
  assert.equal((await call('/api/media', 'POST', { originalName: 'x', mimeType: 'x', sizeBytes: 1, objectKey: 'app-assets/models/tree.glb' })).status, 400);
  const removed = await read(call(`/api/media/${asset.id}`, 'DELETE', { version: ready.version }));
  assert.equal((await call(`/api/media/${asset.id}/url`)).status, 404);
  await call(`/api/media/${asset.id}/restore`, 'POST', { version: removed.version });
  assert.equal((await call(`/api/media/${asset.id}/url`)).status, 200);
});
test('credential-protected model multipart upload, range, HEAD, cache and setup closure', async () => {
  assert.equal((await call('/api/setup/models/tree.glb?action=start', 'POST')).status, 404);
  const headers = { Authorization: 'Bearer test-only' };
  const { uploadId } = await read(call('/api/setup/models/tree.glb?action=start', 'POST', undefined, headers));
  const params = `uploadId=${encodeURIComponent(uploadId)}`;
  const part = await read(call(`/api/setup/models/tree.glb?action=part&part=1&${params}`, 'PUT', new Uint8Array([1, 2, 3, 4]), headers));
  assert.equal((await call(`/api/setup/models/tree.glb?action=complete&${params}`, 'POST', { parts: [part] }, headers)).status, 200);
  const full = await call('/models/tree.glb'); assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-length'), '4'); const etag = full.headers.get('etag'); await full.arrayBuffer();
  const ranged = await call('/models/tree.glb', 'GET', undefined, { Range: 'bytes=1-2' });
  assert.equal(ranged.status, 206); assert.deepEqual(new Uint8Array(await ranged.arrayBuffer()), new Uint8Array([2, 3]));
  assert.equal((await call('/models/tree.glb', 'GET', undefined, { Range: 'bytes=10-' })).status, 416);
  assert.equal((await call('/models/tree.glb', 'GET', undefined, { 'If-None-Match': etag })).status, 304);
  const head = await call('/models/tree.glb', 'HEAD'); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.equal((await call('/models/tree.glb', 'PUT', new Uint8Array([1]))).status, 405);
  // Closing the build must reject even a still-present, formerly valid secret.
  await runtime.setOptions({ ...runtimeOptions, bindings: { MODEL_SETUP_TOKEN: 'test-only' } });
  assert.equal((await call('/api/setup/models/tree.glb?action=start', 'POST', undefined, headers)).status, 404);
});
test('legacy calendar import remains idempotent and retains local data', async () => {
  const values = new Map(Object.entries({ stellarNotes: JSON.stringify({ '2025-0-1': '历史' }),
    stellarAnnals: JSON.stringify([{ date: '2025-01-01', title: '历史纪念', desc: '说明' }]), redlineJournal: JSON.stringify({ '2025-01-01': '历史手记' }) }));
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const adapter = { loadAll: () => read(call('/api/calendar?includeDeleted=true')) };
  for (const [name, type] of [['saveDayNote', 'day-notes'], ['saveAnniversary', 'anniversaries'], ['saveJournal', 'journals']]) {
    adapter[name] = async data => { const response = await call(`/api/calendar/${type}`, 'POST', data); if (!response.ok) throw new Error('Import failed'); return response.json(); };
  }
  const first = await importLegacyCalendar(adapter, storage); assert.equal(first.imported, 3); assert.equal(first.failed, 0);
  const again = await importLegacyCalendar(adapter, storage); assert.equal(again.imported, 0); assert.equal(again.skipped, 3);
  assert.equal(JSON.parse(storage.getItem('stellarNotes'))['2025-0-1'], '历史');
});
