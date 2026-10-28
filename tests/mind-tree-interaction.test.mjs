import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { createBoundsTreeRequest } from '../transition/mind/tree-raycast.js';
import { createThoughtLeaves, worldToTreePoint } from '../transition/mind/thought-leaves.js';

test('shipped compressed tree has accurate, bounded raycasts across repeated rotations', async t => {
    // Exercise Three's real Meshopt/interleaved attribute path. Only image decoding
    // is stubbed; geometry, transforms and indices come from the shipped GLB.
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    loader.register(() => ({ name:'TEST_TEXTURE_STUB', loadTexture() {
        return Promise.resolve(new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1));
    } }));
    const bytes = await readFile(new URL('../models/tree-optimized.glb',import.meta.url));
    const {scene:model} = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = Math.min(6.5/size.y,6.6/size.x,6.6/size.z);
    model.scale.setScalar(scale);
    model.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
    const pivot = new THREE.Group(); pivot.add(model);
    const meshes = []; model.traverse(o => { if(o.isMesh) meshes.push(o); });
    assert.equal(meshes.length,23);
    let serialized;
    globalThis.self = {postMessage(value) { serialized=value; }};
    try {
        await import('../transition/mind/mind-bvh-worker.js');
        for (const mesh of meshes) {
            const geometry = mesh.geometry;
            assert.equal(geometry.attributes.position.isInterleavedBufferAttribute,true);
            self.onmessage({data:createBoundsTreeRequest(geometry)});
            assert.ok(!serialized.error,serialized.error);
            geometry.boundsTree = MeshBVH.deserialize(serialized.serialized,geometry,{setIndex:false});
            // A wrong stride produces overlapping, oversized node bounds even
            // when its outer bounds happen to look plausible.
            const actual = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
            const indexed = geometry.boundsTree.getBoundingBox(new THREE.Box3());
            assert.ok(indexed.min.distanceTo(actual.min)<0.0001);
            assert.ok(indexed.max.distanceTo(actual.max)<0.0001);
            mesh.raycast = acceleratedRaycast;
        }
    } finally {delete globalThis.self;}
    const ray = new THREE.Raycaster(); ray.firstHitOnly=true;
    const direction = new THREE.Vector3(0,0,-1);
    const samples = []; const timings=[];
    for(let step=0;step<36;step++) {
        pivot.rotation.y=step*Math.PI/18;
        pivot.updateMatrixWorld(true);
        for(const x of [-1,0,1]) {
            ray.set(new THREE.Vector3(x,2.5,10),direction);
            const start=performance.now();
            const hit=ray.intersectObjects(meshes,false)[0];
            timings.push(performance.now()-start);
            if(hit && samples.length<3) samples.push(worldToTreePoint(pivot,hit.point));
        }
    }
    assert.ok(samples.length>0, 'tree must remain pickable');
    // Compare one accelerated hit with Three's original exact triangle query.
    pivot.rotation.y=0; pivot.updateMatrixWorld(true);
    ray.set(new THREE.Vector3(0,2.5,10),direction);
    const indexedHit=ray.intersectObjects(meshes,false)[0];
    assert.ok(indexedHit);
    const exactMesh=indexedHit.object; exactMesh.raycast=THREE.Mesh.prototype.raycast;
    const exactHit=ray.intersectObject(exactMesh,false)[0];
    exactMesh.raycast=acceleratedRaycast;
    assert.ok(exactHit.point.distanceTo(indexedHit.point)<1e-8);
    const camera=new THREE.PerspectiveCamera(38,1,0.05,100);
    camera.position.set(0,3,12); camera.lookAt(0,3,0); camera.updateMatrixWorld(true);
    const leaves=createThoughtLeaves(pivot);
    leaves.sync(samples.map((position,i)=>({id:String(i),name:'test',equipped:true,position})));
    const leafStart=performance.now();
    for(let step=0;step<36;step++) {
        pivot.rotation.y=step*Math.PI/18; pivot.updateMatrixWorld(true);
        leaves.faceCamera(camera,meshes);
    }
    const leafMs=performance.now()-leafStart;
    const totalMs=timings.reduce((a,b)=>a+b,0), worstMs=Math.max(...timings);
    t.diagnostic(`108 whole-tree picks: ${totalMs.toFixed(1)}ms total, ${worstMs.toFixed(1)}ms worst; 36 leaf rotations: ${leafMs.toFixed(1)}ms`);
    // Generous CPU budget catches the original overlapping BVHs without
    // depending on a specific frame rate or benchmark machine.
    assert.ok(totalMs<1500,`tree picking consumed ${totalMs}ms`);
    assert.ok(worstMs<250,`single pick blocked for ${worstMs}ms`);
    assert.ok(leafMs<1500,`rotating leaves consumed ${leafMs}ms`);
});
