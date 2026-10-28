import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fetchTreeModelParts } from '../transition/mind/tree-model-loader.js';
import { readSecretInput } from './read-secret-input.mjs';

const { origin, platformToken, setupToken } = await readSecretInput('site verification');
const base = new URL(origin);
const headers = platformToken ? { 'OAI-Sites-Authorization': `Bearer ${platformToken}` } : {};
async function fetchSite(path, options = {}) {
  let target = new URL(path, base);
  for (let redirects = 0; redirects < 5; redirects++) {
    const response = await fetch(target, { ...options, redirect: 'manual', headers: { ...headers, ...options.headers } });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('Location');
    assert.ok(location, 'Redirect lacks Location');
    target = new URL(location, target);
    assert.equal(target.origin, base.origin, 'Site must not redirect to an external login');
    assert.ok(!/signin|login|callback/i.test(target.pathname), 'Site must not redirect to login');
    await response.body?.cancel();
  }
  throw new Error(`Too many redirects: ${path}`);
}
for (const pathname of ['/', '/cover/index.html', '/main/index.html', '/transition/transition.html', '/transition/mind/mind.html']) {
  const response = await fetchSite(pathname);
  assert.equal(response.status, 200, `${pathname}: HTTP ${response.status}`);
  const html = await response.text();
  assert.ok(html.includes('/assets/bootstrap.js'), `${pathname}: missing bootstrap`);
  assert.ok(!/auth-pending|auth-guard|cloudbase/i.test(html));
  console.log(`${pathname}: 200, no login gate`);
}
const calendarResponse = await fetchSite('/api/calendar');
assert.equal(calendarResponse.status, 200);
const calendar = await calendarResponse.json();
for (const key of ['dayNotes', 'anniversaries', 'journals']) assert.ok(Array.isArray(calendar[key]));
console.log('Shared calendar: D1 available');
const counterPage = await fetchSite('/transition/counter/counter.html');
assert.equal(counterPage.status, 200);
const counterHtml = await counterPage.text();
assert.ok(counterHtml.includes('state.js') && counterHtml.includes('counter-back'));
const counterResponse = await fetchSite('/api/counter');
assert.equal(counterResponse.status, 200);
const counter = await counterResponse.json();
assert.match(counter.value, /^(0|[1-9]\d*)$/);
console.log(`Shared counter: D1 available, cumulative value ${counter.value}`);
for (const pathname of ['sidebar.css', 'sidebar.js', 'counter/state.js',
  'counter/assets/golden-egypt-background.png', 'counter/assets/happiness-card.png',
  'counter/assets/wife-discontent-card.png', 'counter/assets/life-scepter-card.png', 'counter/assets/twin-dragon-card.png']) {
  const response = await fetchSite(`/transition/${pathname}`, { method: 'HEAD' });
  assert.equal(response.status, 200, `${pathname}: HTTP ${response.status}`);
}
console.log('Counter entry, scripts and image assets: available');
const manifestResponse = await fetchSite('/assets/asset-manifest.js');
assert.equal(manifestResponse.status, 200);
const manifest = await manifestResponse.text();
const lightweight = JSON.parse(manifest.match(/^globalThis\.BLACKDOOR_ASSETS=(.*);\s*$/s)[1]).treeModel;
assert.ok(lightweight?.parts?.length, 'Missing lightweight tree in the asset manifest');
const lightweightSize = (await stat(new URL('../models/tree-optimized.glb', import.meta.url))).size;
assert.equal(lightweight.byteLength, lightweightSize);
for (const part of lightweight.parts) {
  const metadata = await fetchSite(part.url, { method: 'HEAD' });
  assert.equal(metadata.status, 200);
  // The Sites static gateway can omit HEAD lengths and ignore Range requests.
  if (metadata.headers.has('Content-Length')) assert.equal(Number(metadata.headers.get('Content-Length')), part.byteLength);
}
const lightweightBytes = new Uint8Array(await fetchTreeModelParts(lightweight, undefined, fetchSite));
assert.equal(lightweightBytes.length, lightweightSize);
assert.equal(new TextDecoder().decode(lightweightBytes.slice(0, 4)), 'glTF');
const checksum = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(checksum(lightweightBytes), checksum(await readFile(new URL('../models/tree-optimized.glb', import.meta.url))));
console.log(`Lightweight tree: all ${lightweight.parts.length} parts downloaded, integrity and full GLB checksum verified (${lightweightSize} bytes)`);
for (const filename of ['tree.glb', 'moon.glb', 'disco.glb', 'deer_head.glb']) {
  const metadata = await fetchSite(`/models/${filename}`, { method: 'HEAD' });
  assert.equal(metadata.status, 200);
  const size = (await stat(new URL(`../models/${filename}`, import.meta.url))).size;
  assert.equal(Number(metadata.headers.get('Content-Length')), size);
  const response = await fetchSite(`/models/${filename}`, { headers: { Range: 'bytes=0-15' } });
  assert.equal(response.status, 206);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(bytes.length, 16);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'glTF');
  const cached = await fetchSite(`/models/${filename}`, { headers: { 'If-None-Match': metadata.headers.get('ETag') } });
  assert.equal(cached.status, 304);
  console.log(`${filename}: ${size} bytes, GLB header, HEAD, Range and ETag verified`);
}
const closed = await fetchSite('/api/setup/models/tree.glb?action=start', { method: 'POST', headers: setupToken ? { Authorization: `Bearer ${setupToken}` } : {} });
assert.equal(closed.status, 404, 'Model initialization must be closed');
console.log('Model initialization: closed (404)');
