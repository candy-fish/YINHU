import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const config = JSON.parse(await readFile(new URL('../deployment.public.json', import.meta.url), 'utf8'));
const api = async (path, method = 'GET', data) => {
  const response = await fetch(config.apiBase + '/api/' + path, { method,
    headers: { apikey: config.publicApiKey, ...(data && !(data instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}) },
    body: data === undefined ? undefined : data instanceof Uint8Array ? data : JSON.stringify(data)
  });
  const result = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : new Uint8Array(await response.arrayBuffer());
  return { response, result };
};
const cleanup = [];
try {
  const health = await api('health');
  assert.equal(health.response.status, 200, JSON.stringify(health.result));
  assert.equal(health.result.importsLocalData, false);
  const denied = await fetch(config.apiBase + '/api/health');
  assert.equal(denied.status, 401);
  const preflight = await fetch(config.apiBase + '/api/thoughts', { method: 'OPTIONS', headers: {
    Origin: 'https://candy-fish.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'apikey,content-type'
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  const image = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
  const created = await api('media', 'POST', { originalName: 'synthetic-deployment-check.png', mimeType: 'image/png', sizeBytes: image.length });
  assert.equal(created.response.status, 201, JSON.stringify(created.result));
  const upload = await api('media/' + created.result.id + '/content', 'PUT', image);
  assert.equal(upload.response.status, 200, JSON.stringify(upload.result));
  cleanup.push(['media', upload.result]);
  const prefix = 'deployment-check-' + crypto.randomUUID().slice(0,8);
  const thought = await api('thoughts', 'POST', { name: prefix, description: 'Synthetic deployment verification. No browser data.', position: {x:0,y:0,z:0}, equipped:false, mediaId:upload.result.id, mediaType:'image/png' });
  assert.equal(thought.response.status,201,JSON.stringify(thought.result)); cleanup.push(['thoughts',thought.result]);
  const changed = await api('thoughts/' + thought.result.id,'PATCH',{version:1,equipped:true});
  assert.equal(changed.response.status,200,JSON.stringify(changed.result)); cleanup.at(-1)[1]=changed.result;
  const stale = await api('thoughts/' + thought.result.id,'PATCH',{version:1,equipped:false});
  assert.equal(stale.response.status,409);
  const loaded = await api('thoughts');
  assert.equal(loaded.result.find(row=>row.id===thought.result.id).equipped,true);
  const window = await api('windows','POST',{title:prefix,date:'2099-10-28',frame:{width:100,height:100,y:100},mediaId:upload.result.id,mediaType:'image/png'});
  assert.equal(window.response.status,201,JSON.stringify(window.result));cleanup.push(['windows',window.result]);
  const readImage=await api('media/'+upload.result.id+'/content');
  assert.deepEqual(readImage.result,image);
  const link=await api('media/'+upload.result.id+'/url');
  assert.equal(link.response.status,200,JSON.stringify(link.result));
  const direct=await fetch(link.result.url);
  assert.equal(direct.status,200);
  assert.deepEqual(new Uint8Array(await direct.arrayBuffer()),image);
  const origin=new URL(config.apiBase).origin;
  const blocked=await fetch(origin+'/rest/v1/blackdoor_records?select=id',{headers:{apikey:config.publicApiKey}});
  assert.ok([401,403].includes(blocked.status),'Anonymous direct database access must be denied');
  const counter=await api('counter');
  assert.equal(counter.response.status,200);
  assert.match(counter.result.value,/^\d+$/);
  console.log(JSON.stringify({healthy:true,sharedReadWrite:true,versionConflict:true,imageRoundtrip:true,signedMedia:true,cors:true,directDatabaseBlocked:true,importsLocalData:false,counter:counter.result.value}));
} finally {
  for(const [type,row]of cleanup.reverse()){
    const removed=await api(type+'/'+row.id,'DELETE',{version:row.version});
    assert.equal(removed.response.status,200,'Synthetic verification cleanup failed');
  }
}
