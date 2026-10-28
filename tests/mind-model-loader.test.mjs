import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTreeModelParts } from '../transition/mind/tree-model-loader.js';

const integrity = `sha256-${'A'.repeat(43)}=`;
function manifest(count = 5) {
    return { byteLength: count * 3, parts: Array.from({length:count},(_,index) => ({
        url:`/assets/models/tree-abc123def456-part-${index+1}.bin`, byteLength:3, integrity
    })) };
}

test('tree parts download with bounded concurrency, preserve order and report aggregate progress', async () => {
    let active = 0, maximum = 0;
    const progress = [];
    const requests = [];
    const buffer = await fetchTreeModelParts(manifest(),event => progress.push(event.loaded),async (url,options) => {
        const index = Number(url.match(/part-(\d+)/)[1]) - 1;
        active++;
        maximum = Math.max(maximum,active);
        requests.push(options);
        await new Promise(resolve => setTimeout(resolve,6-index));
        active--;
        return new Response(new Uint8Array([index*3,index*3+1,index*3+2]));
    });
    assert.deepEqual([...new Uint8Array(buffer)],Array.from({length:15},(_,index) => index));
    assert.equal(maximum,3);
    assert.equal(progress[0],0);
    assert.equal(progress.at(-1),15);
    assert.ok(progress.every((loaded,index) => index === 0 || loaded >= progress[index-1]));
    assert.ok(requests.every(options => options.integrity === integrity && options.credentials === 'same-origin'));
});

test('a missing or incomplete part fails atomically and aborts the remaining downloads', async () => {
    const signals = [];
    await assert.rejects(fetchTreeModelParts(manifest(),undefined,async (url,options) => {
        signals.push(options.signal);
        return new Response(new Uint8Array([1,2]));
    }),/Incomplete tree model part/);
    assert.ok(signals.every(signal => signal.aborted));
    await assert.rejects(fetchTreeModelParts(manifest(1),undefined,async () => new Response(null,{status:404})),/HTTP 404/);
});

test('invalid manifests are rejected before any network request', async () => {
    let called = false;
    const fetcher = async () => { called = true; throw new Error('must not fetch'); };
    const invalid = manifest(1);
    invalid.parts[0].url = 'https://example.com/unrelated';
    await assert.rejects(fetchTreeModelParts(invalid,undefined,fetcher),/Invalid tree model part/);
    await assert.rejects(fetchTreeModelParts({...manifest(),byteLength:1},undefined,fetcher),/size mismatch/);
    assert.equal(called,false);
});
