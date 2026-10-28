import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/blackdoor/handler.mjs';
import { testDatabase } from './helpers/shared-test-db.mjs';
let database, handler;
before(async () => { database = await testDatabase(); handler = createHandler(database.repository); });
after(async () => { await database.db.close(); });
function call(path, method = 'GET', data) {
  return handler(new Request('https://example.supabase.co/functions/v1/blackdoor/api/' + path, {
    method, body: data === undefined ? undefined : data instanceof Uint8Array ? data : JSON.stringify(data)
  }));
}
const read = async response => (await response).json();
test('two visitors share calendar records with version conflicts and recoverable deletes', async () => {
  const created = await read(call('calendar/day-notes', 'POST', { noteDate: '2026-10-28', content: 'shared' }));
  assert.equal(created.version, 1);
  assert.equal((await read(call('calendar'))).dayNotes[0].id, created.id);
  const changed = await read(call('calendar/day-notes/' + created.id, 'PATCH', { version: 1, content: 'second visitor' }));
  assert.equal(changed.version, 2);
  const stale = await call('calendar/day-notes/' + created.id, 'PATCH', { version: 1, content: 'stale' });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).remote.content, 'second visitor');
  await call('calendar/day-notes/' + created.id, 'DELETE', { version: 2 });
  assert.equal((await read(call('calendar'))).dayNotes.length, 0);
  const restored = await read(call('calendar/day-notes', 'POST', { noteDate: '2026-10-28', content: 'restored' }));
  assert.equal(restored.id, created.id);
  assert.equal(restored.version, 4);
  assert.equal((await call('calendar/day-notes', 'POST', { noteDate: '2026-10-28', content: 'duplicate' })).status, 409);
});
test('shared windows and thoughts require valid uploaded media and preserve equip changes', async () => {
  const asset = await read(call('media', 'POST', { originalName: 'cover.png', mimeType: 'image/png', sizeBytes: 3 }));
  assert.equal((await call('media/' + asset.id + '/content')).status, 404);
  assert.equal((await call('media/' + asset.id + '/content', 'PUT', new Uint8Array([1,2]))).status, 400);
  const uploaded = await read(call('media/' + asset.id + '/content', 'PUT', new Uint8Array([1,2,3])));
  assert.equal(uploaded.status, 'ready');
  const values = { name: 'shared thought', description: 'same tree', position: { x: 1, y: 2, z: 3 }, equipped: false, mediaId: asset.id, mediaType: 'image/png' };
  const thought = await read(call('thoughts', 'POST', values));
  assert.equal(thought.equipped, false);
  assert.ok(Number.isFinite(thought.createdAt));
  const equipped = await read(call('thoughts/' + thought.id, 'PATCH', { equipped: true, version: 1 }));
  assert.equal(equipped.version, 2);
  assert.equal((await read(call('thoughts')))[0].equipped, true);
  const input = { title: 'memory', date: '2026-10-28', dateEnd: '', material: 'shared photo', frame: {width:150,height:120,y:80}, mediaId:asset.id,mediaType:'image/png' };
  const window = await read(call('windows', 'POST', input));
  assert.equal((await read(call('windows')))[0].id, window.id);
  const content = await call('media/' + asset.id + '/content');
  assert.deepEqual(new Uint8Array(await content.arrayBuffer()), new Uint8Array([1,2,3]));
  assert.equal(content.headers.get('content-type'), 'application/octet-stream');
  assert.equal((await call('thoughts', 'POST', {...values,mediaId:crypto.randomUUID()})).status,400);
  await call('windows/' + window.id, 'DELETE', {version:1});
  assert.equal((await read(call('windows'))).length,0);
});
test('API rejects malformed fields, dates, geometry, IDs and unapproved resources', async () => {
  for (const [path, input, status] of [
    ['thoughts', {name:'x',position:{x:'1',y:2,z:3}},400],
    ['thoughts', {name:'x',position:{x:1,y:2,z:3},workspace_id:'foreign'},400],
    ['windows', {title:'x',date:'2026-02-30',frame:{width:100,height:100,y:100}},400],
    ['windows', {title:'x',date:'2026-10-28',frame:{width:100,height:100,y:500}},400],
    ['calendar/day-notes', {noteDate:'2026-02-30',content:'x'},400],
    ['__proto__', {},404],
    ['thoughts/not-a-uuid', {},404]
  ]) assert.equal((await call(path,'POST',input)).status,status,path);
  const preflight=await call('thoughts','OPTIONS');
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),'*');
  assert.equal((await read(call('health'))).importsLocalData,false);
});

test('API key wrapper authenticates shared callers and permits preflight',async()=>{
  const { withAPIKey }=await import('../supabase/functions/blackdoor/handler.mjs');
  const handler=withAPIKey(()=>Response.json({ok:true}),['public-test-key']);
  assert.equal((await handler(new Request('https://test/api/health'))).status,401);
  assert.equal((await handler(new Request('https://test/api/health',{headers:{apikey:'wrong'}}))).status,401);
  assert.equal((await handler(new Request('https://test/api/health',{headers:{apikey:'public-test-key'}}))).status,200);
});
