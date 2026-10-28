import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { createBoundsTreeRequest, generateBoundsTree } from '../transition/mind/tree-raycast.js';

let workerInstance = 0;
async function runWorker(request) {
    let result;
    globalThis.self = { postMessage(value) { result = value; } };
    try {
        await import(`../transition/mind/mind-bvh-worker.js?instance=${++workerInstance}`);
        self.onmessage({ data: structuredClone(request) });
        assert.ok(!result.error, result.error);
        return result.serialized;
    } finally { delete globalThis.self; }
}

test('BVH worker preserves normalized integer coordinates used by the lightweight tree', async () => {
    let result;
    globalThis.self = { postMessage(value) { result = value; } };
    try {
        await import('../transition/mind/mind-bvh-worker.js');
        self.onmessage({ data: {
            position: new Int16Array([-32767,-32767,0, 32767,-32767,0, 0,32767,0]),
            positionNormalized: true,
            index: new Uint16Array([0,1,2]), groups: [],
            options: { indirect: true }
        } });
        assert.ok(!result.error, result.error);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Int16Array([-32767,-32767,0,32767,-32767,0,0,32767,0]),3,true));
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0,1,2]),1));
        const bounds = MeshBVH.deserialize(result.serialized,geometry,{setIndex:false}).getBoundingBox(new THREE.Box3());
        assert.ok(Math.abs(bounds.min.x + 1) < 1e-5);
        assert.ok(Math.abs(bounds.max.y - 1) < 1e-5);
    } finally {
        delete globalThis.self;
    }
});

test('worker preserves interleaved stride, offset, normalization and source buffers', async () => {
    for (const normalized of [false, true]) {
        const values = new Int16Array([900, -100,-100,0,700, 900,100,-100,0,700, 900,0,100,0,700]);
        const geometry = new THREE.BufferGeometry();
        const position = new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(values,5),3,1,normalized);
        geometry.setAttribute('position', position);
        geometry.setIndex([0,1,2]);
        const request = createBoundsTreeRequest(geometry);
        assert.equal(request.positionStride,5);
        assert.equal(request.positionOffset,1);
        assert.notEqual(request.position.buffer,values.buffer);
        assert.notEqual(request.index.buffer,geometry.index.array.buffer);
        geometry.boundsTree = MeshBVH.deserialize(await runWorker(request), geometry, {setIndex:false});
        const bounds = geometry.boundsTree.getBoundingBox(new THREE.Box3());
        const extent = normalized ? 100 / 32767 : 100;
        assert.ok(Math.abs(bounds.min.x + extent) < 1e-4);
        assert.ok(Math.abs(bounds.max.y - extent) < 1e-4);
        assert.ok(Math.abs(bounds.max.z) < 1e-6, 'padding must not become a vertex coordinate');
        const mesh = new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
        mesh.raycast = acceleratedRaycast;
        const ray = new THREE.Raycaster(new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1));
        ray.firstHitOnly = true;
        assert.equal(ray.intersectObject(mesh).length,1);
        assert.equal(values.byteLength,30);
    }
});

test('worker failures, blocked workers and timeouts reject without synchronous geometry fallback', async () => {
    const geometry = new THREE.BoxGeometry();
    const errorWorker = {postMessage(){ this.onmessage({data:{error:'index failed'}}); }};
    await assert.rejects(generateBoundsTree(errorWorker,geometry), /index failed/);
    const blockedWorker = {postMessage(){ throw new Error('worker blocked'); }};
    await assert.rejects(generateBoundsTree(blockedWorker,geometry), /worker blocked/);
    const silentWorker = {postMessage(){}};
    await assert.rejects(generateBoundsTree(silentWorker,geometry,5), /timed out/);
    assert.equal(silentWorker.onmessage,null);
    assert.equal(geometry.boundsTree,undefined);
});
