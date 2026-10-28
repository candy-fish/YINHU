import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('../transition/counter/state.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); };

function memoryStorage() {
  const values = new Map();
  return { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key) };
}

function sharedServer() {
  let value = 0n;
  const operations = new Set();
  const state = { offline: false, loseNextReply: false,
    get value() { return value; },
    reset() { value = 0n; },
    async fetch(path, options) {
      if (state.offline) throw new TypeError('offline');
      if (options.method === 'POST') {
        const { id } = JSON.parse(options.body);
        if (!operations.has(id)) { operations.add(id); value += 1n; }
        if (state.loseNextReply) { state.loseNextReply = false; throw new TypeError('reply lost'); }
        return Response.json({ value: String(value), id });
      }
      return Response.json({ value: String(value) });
    }
  };
  return state;
}

function client(server, storage = memoryStorage()) {
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { hidden: false });
  const context = vm.createContext({ window, document, localStorage: storage, crypto: webcrypto,
    fetch: server.fetch, AbortController, setTimeout, clearTimeout, setInterval: () => 1, console });
  vm.runInContext(source, context);
  return { api: context.BlackDoorCounter, window, storage };
}

test('independent devices share a cumulative counter and reload retains it', async () => {
  const server = sharedServer();
  const first = client(server);
  const second = client(server);
  await settle();
  for (let i = 0; i < 8; i++) first.api.increment();
  for (let i = 0; i < 5; i++) second.api.increment();
  await settle();
  first.api.refresh(); second.api.refresh();
  await settle();
  assert.equal(server.value, 13n);
  assert.equal(first.api.value, '13');
  assert.equal(second.api.value, '13');
  const reloaded = client(server, first.storage);
  await settle();
  assert.equal(reloaded.api.value, '13');
});

test('offline increments survive reload and are eventually sent exactly once', async () => {
  const server = sharedServer();
  const first = client(server);
  await settle();
  server.offline = true;
  first.api.increment(); first.api.increment(); first.api.increment();
  await settle();
  const reloaded = client(server, first.storage);
  await settle();
  assert.equal(reloaded.api.value, '3');
  server.offline = false;
  reloaded.window.dispatchEvent(new Event('online'));
  await settle();
  assert.equal(server.value, 3n);
  assert.equal(reloaded.api.value, '3');
});

test('a committed increment whose response was lost is not added again after reload', async () => {
  const server = sharedServer();
  const first = client(server);
  await settle();
  server.loseNextReply = true;
  first.api.increment();
  await settle();
  assert.equal(server.value, 1n);
  const reloaded = client(server, first.storage);
  await settle();
  assert.equal(server.value, 1n);
  assert.equal(reloaded.api.value, '1');
});

test('two tabs retrying the same durable queue do not duplicate increments', async () => {
  const server = sharedServer();
  server.offline = true;
  const storage = memoryStorage();
  const first = client(server, storage);
  first.api.increment(); first.api.increment();
  await settle();
  const second = client(server, storage);
  await settle();
  server.offline = false;
  first.api.refresh(); second.api.refresh();
  await settle();
  first.api.refresh(); second.api.refresh();
  await settle();
  assert.equal(server.value, 2n);
  assert.equal(first.api.value, '2');
  assert.equal(second.api.value, '2');
});

test('an authoritative administrative reset replaces an older cached count', async () => {
  const server = sharedServer();
  const first = client(server);
  await settle();
  first.api.increment(); first.api.increment();
  await settle();
  assert.equal(first.api.value, '2');
  server.reset();
  first.api.refresh();
  await settle();
  assert.equal(first.api.value, '0');
  const reloaded = client(server, first.storage);
  await settle();
  assert.equal(reloaded.api.value, '0');
});
