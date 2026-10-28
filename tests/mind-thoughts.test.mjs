import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createThoughtRepository, validateThought, openThoughtStorage } from '../transition/mind/thought-store.js';
import { createThoughtLeaves, worldToTreePoint } from '../transition/mind/thought-leaves.js';

const input = { name: '  枝头回响  ', description: '  一念生长。  ', position: { x: -1.5, y: 2.1, z: 0.75 } };
function memoryStorage() {
    const records = new Map();
    return {
        fail: false,
        async list() { return [...records.values()].map(record => structuredClone(record)); },
        async put(record) {
            if (this.fail) throw new Error('quota');
            records.set(record.id, structuredClone(record));
        }
    };
}

test('new thoughts remain unequipped until explicitly equipped and survive reopening with their image', async () => {
    const storage = memoryStorage();
    const first = createThoughtRepository(storage);
    await first.load();
    assert.equal(first.records.length, 0);
    const blob = new Blob(['test image bytes'], { type: 'image/png' });
    const record = await first.add({ ...input, image: blob });
    assert.equal(record.name, '枝头回响');
    assert.equal(record.equipped, false);
    await first.setEquipped(record.id, true);
    await first.setEquipped(record.id, true);
    const reopened = createThoughtRepository(storage);
    await reopened.load();
    assert.equal(reopened.records.length, 1);
    assert.equal(reopened.records[0].equipped, true);
    assert.deepEqual(reopened.records[0].position, input.position);
    assert.equal(await reopened.records[0].image.text(), 'test image bytes');
    await reopened.setEquipped(record.id, false);
    assert.equal(reopened.records[0].equipped, false);
    assert.equal(reopened.records.length, 1);
});

test('failed saves and equip changes leave in-memory cards and leaves unchanged', async () => {
    const storage = memoryStorage();
    const repo = createThoughtRepository(storage);
    const record = await repo.add(input);
    storage.fail = true;
    await assert.rejects(repo.add({ ...input, name: 'another' }), /quota/);
    assert.equal(repo.records.length, 1);
    await assert.rejects(repo.setEquipped(record.id, true), /quota/);
    assert.equal(repo.records[0].equipped, false);
    storage.fail = false;
    await repo.setEquipped(record.id, true);
    storage.fail = true;
    await assert.rejects(repo.setEquipped(record.id, false), /quota/);
    assert.equal(repo.records[0].equipped, true);
});

test('reject empty names, missing or non-finite coordinates and unsupported/oversized images', async () => {
    assert.throws(() => validateThought({ ...input, name: '  ' }), /名称/);
    for (const x of [NaN, Infinity, -Infinity, '', undefined]) {
        assert.throws(() => validateThought({ ...input, position: { x, y: 0, z: 0 } }), /坐标/);
    }
    assert.throws(() => validateThought({ ...input, image: new Blob(['svg'], { type: 'image/svg+xml' }) }), /图片/);
    assert.throws(() => validateThought({ ...input, image: new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'image/png' }) }), /图片/);
    assert.equal(validateThought(input).image, null);
    await assert.rejects(openThoughtStorage(null), /数据库/);
});

test('tree coordinates and equipped leaves remain anchored under yaw, fixed tilt and translated ancestors', () => {
    const parent = new THREE.Group();
    parent.position.set(2, -1, 3);
    parent.rotation.x = THREE.MathUtils.degToRad(11);
    const pivot = new THREE.Group();
    parent.add(pivot);
    const leaves = createThoughtLeaves(pivot);
    const local = new THREE.Vector3(-1.5, 2.1, 0.75);
    const record = { ...input, id: 'leaf', equipped: true };
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 3, 12);
    camera.lookAt(0, 3, 0);
    for (const yaw of [-Math.PI, -0.22, 0, 1.4, Math.PI]) {
        pivot.rotation.y = yaw;
        parent.updateMatrixWorld(true);
        const world = pivot.localToWorld(local.clone());
        assert.ok(worldToTreePoint(pivot, world).distanceTo(local) < 1e-10);
        leaves.sync([record]);
        leaves.sync([record]);
        assert.equal(leaves.meshes.length, 1);
        leaves.faceCamera(camera);
        parent.updateMatrixWorld(true);
        assert.ok(leaves.meshes[0].parent.getWorldPosition(new THREE.Vector3()).distanceTo(world) < 1e-10);
    }
    leaves.sync([record, { ...record, id: 'second', name: 'second', position: { x: 1, y: 3, z: 0 } }]);
    assert.equal(leaves.meshes.length, 2);
    leaves.sync([{ ...record, equipped: false }]);
    assert.equal(leaves.meshes.length, 0);
});

test('leaf clears the surface without moving its projected anchor and stays hidden behind tree geometry', () => {
    const pivot = new THREE.Group();
    const bark = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshBasicMaterial());
    pivot.add(bark);
    const leaves = createThoughtLeaves(pivot);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    leaves.sync([{ id: 'surface', equipped: true, position: { x: 0, y: 0, z: 1 } }]);
    for (const yaw of [0, 0.6, 1.1]) {
        pivot.rotation.y = yaw;
        pivot.updateMatrixWorld(true);
        leaves.faceCamera(camera, [bark]);
        pivot.updateMatrixWorld(true);
        assert.equal(leaves.meshes.length, 1);
        const body = leaves.meshes[0];
        const anchor = body.parent.getWorldPosition(new THREE.Vector3());
        const displayed = body.getWorldPosition(new THREE.Vector3());
        assert.ok(displayed.distanceTo(camera.position) < anchor.distanceTo(camera.position));
        const anchorScreen = anchor.clone().project(camera);
        const displayScreen = displayed.clone().project(camera);
        assert.ok(Math.hypot(anchorScreen.x - displayScreen.x, anchorScreen.y - displayScreen.y) < 1e-10);
        const positions = body.geometry.attributes.position;
        for (let index = 0; index < positions.count; index++) {
            const point = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(body.matrixWorld);
            assert.ok(point.length() > 1, `leaf vertex clips bark at yaw ${yaw}`);
        }
        assert.equal(body.material.depthTest, true);
    }
    pivot.rotation.y = Math.PI;
    pivot.updateMatrixWorld(true);
    leaves.faceCamera(camera, [bark]);
    assert.equal(leaves.meshes.length, 0);
    pivot.rotation.y = 0;
    pivot.updateMatrixWorld(true);
    leaves.faceCamera(camera, [bark]);
    assert.equal(leaves.meshes.length, 1);
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.2), new THREE.MeshBasicMaterial());
    blocker.position.z = 1.4;
    blocker.updateMatrixWorld(true);
    leaves.faceCamera(camera, [bark, blocker]);
    assert.equal(leaves.meshes.length, 0);
});
