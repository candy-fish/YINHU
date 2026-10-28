import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/blackdoor/handler.mjs';
import { testDatabase } from './helpers/shared-test-db.mjs';
import { createSharedImageStore } from '../transition/images/image-store.js';
import { createThoughtRepository, openThoughtStorage } from '../transition/mind/thought-store.js';
import { publishable } from '../scripts/export-github.mjs';
import { apiURL } from '../src/api-url.js';
test('cloud clients share windows and thoughts across independent instances without opening legacy IndexedDB', async () => {
  const database=await testDatabase();
  const originalFetch=globalThis.fetch, originalConfig=globalThis.BLACKDOOR_CONFIG;
  const handler=createHandler(database.repository);
  globalThis.BLACKDOOR_CONFIG={shared:true,apiBase:'https://cloud.example/functions/v1/blackdoor'};
  globalThis.fetch=(url,options)=>handler(new Request(url,options));
  try {
    assert.equal(apiURL('/api/health'),'https://cloud.example/functions/v1/blackdoor/api/health');
    const one=createSharedImageStore(), two=createSharedImageStore();
    assert.deepEqual(await one.listWindows(),[]);
    const saved=await one.saveWindow({title:'new online only',date:'2026-10-28',frame:{width:100,height:100,y:100},cover:new Blob(['photo'],{type:'image/png'})});
    const remote=(await two.listWindows())[0];
    assert.equal(remote.id,saved.id);
    assert.equal(await remote.cover.text(),'photo');
    await two.saveWindow({...remote,title:'other visitor'});
    await assert.rejects(one.saveWindow({...saved,title:'old edit'}),/重新载入/);
    await one.listWindows();
    await one.deleteWindow(saved.id);
    assert.deepEqual(await two.listWindows(),[]);
    const legacy={open(){throw Error('Must never open legacy IndexedDB')}};
    const a=createThoughtRepository(await openThoughtStorage(legacy));
    const b=createThoughtRepository(await openThoughtStorage(legacy));
    await a.load(); await b.load();
    const thought=await a.add({name:'new shared thought',position:{x:1,y:2,z:3},image:new Blob(['mind'],{type:'image/png'})});
    await b.load();
    assert.equal(b.records[0].id,thought.id);
    assert.equal(await b.records[0].image.text(),'mind');
    await b.setEquipped(thought.id,true);
    await a.load();
    assert.equal(a.records[0].equipped,true);
    assert.equal(a.records[0].version,2);
  } finally { globalThis.fetch=originalFetch;globalThis.BLACKDOOR_CONFIG=originalConfig;await database.db.close(); }
});
test('publication filter excludes browser data, local state, credentials, history and oversized original model',()=>{
  for(const file of ['.cache/shared-preview/state.sqlite','hosting/.dev.vars','supabase/.env','src/cookies.json','src/storage-state.json','src/test.sqlite','transition/backup.har','models/tree.glb','.git/config','backups/photos.json','supabase/.temp/token']) assert.equal(publishable(file),false,file);
  for(const file of ['src/api-client.js','models/tree-optimized.glb','supabase/migrations/20261028000100_shared_workspace.sql','.github/workflows/pages.yml','transition/images/assets/deer-companion.glb']) assert.equal(publishable(file),true,file);
});
