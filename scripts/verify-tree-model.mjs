import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const source = new URL('../models/tree.glb',import.meta.url);
const target = new URL('../models/tree-optimized.glb',import.meta.url);
const original = await io.read(fileURLToPath(source));
const optimized = await io.read(fileURLToPath(target));
const triangles = doc => doc.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives())
    .reduce((sum,primitive) => sum + primitive.getIndices().getCount()/3,0);
assert.equal(triangles(optimized),triangles(original),'Tree triangles must not be simplified.');
const hashes = doc => doc.getRoot().listTextures().map(texture => createHash('sha256').update(texture.getImage()).digest('hex')).sort();
assert.deepEqual(hashes(optimized),hashes(original),'All original texture images must remain byte-identical.');
const before = getBounds(original.getRoot().listScenes()[0]);
const after = getBounds(optimized.getRoot().listScenes()[0]);
for (const bound of ['min','max']) for (let axis=0;axis<3;axis++) {
    assert.ok(Math.abs(before[bound][axis]-after[bound][axis]) < 0.0002,'Tree bounds changed unexpectedly.');
}
const [sourceFile,targetFile] = await Promise.all([stat(source),stat(target)]);
assert.ok(targetFile.size < 50*1024*1024);
console.log(`Lightweight tree verified: ${triangles(optimized)} triangles; all ${hashes(optimized).length} original textures unchanged; ${(100-targetFile.size/sourceFile.size*100).toFixed(1)}% fewer bytes; shipped Meshopt decoder works.`);
