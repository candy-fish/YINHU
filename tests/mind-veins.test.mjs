import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTreeVeins } from '../transition/mind/tree-veins.js';
import { GOLDEN_LIGHT } from '../transition/mind/golden-light.js';

function fixture() {
    const scene = new THREE.Group();
    const pivot = new THREE.Group();
    scene.add(pivot);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,3,48), new THREE.MeshBasicMaterial());
    trunk.position.y = 1.5;
    pivot.add(trunk);
    return { scene, pivot, trunk };
}
const trace = { view: 'front', points: [[0.02,0.2],[0.05,1],[0.02,2],[0.03,2.8]] };

test('golden veins lie on actual bark and rotate with the tree without altering its geometry', async () => {
    const { scene, pivot, trunk } = fixture();
    scene.rotation.x = 0.19;
    pivot.rotation.y = 1.3;
    const original = trunk.geometry.getAttribute('position').array.slice();
    const veins = createTreeVeins(pivot);
    await veins.build([trunk], [trace]);
    assert.equal(veins.root.children.length, 2);
    const [halo, flow] = veins.root.children;
    assert.equal(halo.geometry, flow.geometry);
    const geometry = flow.geometry;
    const positions = geometry.getAttribute('position');
    const sizes = geometry.getAttribute('aSize');
    for (let index = 0; index < positions.count; index++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions,index);
        assert.ok(Math.abs(Math.hypot(point.x,point.z) - 0.5) < 0.002);
        assert.ok(sizes.getX(index) > 0.004 && sizes.getX(index) < 0.008);
    }
    assert.deepEqual(trunk.geometry.getAttribute('position').array, original);
    for (const mesh of veins.root.children) {
        assert.equal(mesh.material.depthTest,true);
        assert.equal(mesh.material.depthWrite,false);
        assert.ok(mesh.material.uniforms.uGold.value.equals(new THREE.Color(GOLDEN_LIGHT.halo)));
    }
    assert.equal(veins.update(1000,false),true);
    assert.equal(flow.material.uniforms.uTime.value,1);
    assert.equal(veins.update(1010,false),false);
    assert.equal(veins.update(2000,true),true);
    assert.equal(flow.material.uniforms.uTime.value,0);
    assert.equal(veins.update(3000,true),false);
});

test('surface strokes never bridge missing bark or jump to a distant surface', async () => {
    const { pivot, trunk } = fixture();
    const veins = createTreeVeins(pivot);
    await veins.build([trunk], [{ view: 'front', points: [[-1,0.6],[-0.8,1],[0,1.5],[0.8,2],[1,2.4]] }]);
    const geometry = veins.root.children[1].geometry;
    const positions = geometry.getAttribute('position');
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 4) {
        a.fromBufferAttribute(positions,index);
        b.fromBufferAttribute(positions,index+2);
        assert.ok(a.distanceTo(b) <= 0.18 + 1e-6);
        assert.ok(Math.abs(a.x) <= 0.5 && Math.abs(b.x) <= 0.5);
    }
});

test('rotating the tree between sampling batches does not detach later strokes', async () => {
    const { pivot, trunk } = fixture();
    const veins = createTreeVeins(pivot);
    const building = veins.build([trunk], [trace, trace]);
    pivot.rotation.y = 2.1;
    await building;
    const positions = veins.root.children[1].geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions,index);
        assert.ok(Math.abs(Math.hypot(point.x,point.z) - 0.5) < 0.002);
    }
});
