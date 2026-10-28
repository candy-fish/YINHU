import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTreeAtmosphere } from '../transition/mind/tree-atmosphere.js';
import { GOLDEN_LIGHT } from '../transition/mind/golden-light.js';

test('atmospheric dust surrounds the entire tree in depth and stays airborne while the tree rotates', () => {
    const frame = new THREE.Group();
    const pivot = new THREE.Group();
    frame.add(pivot);
    const dust = createTreeAtmosphere(frame,new THREE.Vector3(6.6,5,6.2));
    const [halo,grains] = dust.root.children;
    assert.equal(halo.geometry,grains.geometry);
    const positions = grains.geometry.getAttribute('position');
    let minY = Infinity, maxY = -Infinity, near = 0, far = 0;
    const center = new THREE.Vector3();
    for (let index = 0; index < positions.count; index++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions,index);
        center.add(point);
        minY = Math.min(minY,point.y);
        maxY = Math.max(maxY,point.y);
        if (point.z > 1) near++;
        if (point.z < -1) far++;
    }
    center.divideScalar(positions.count);
    assert.ok(Math.abs(center.x) < 0.25 && Math.abs(center.z) < 0.25);
    assert.ok(minY >= 0.27 && maxY > 5.2);
    assert.ok(near > 100 && far > 100);
    const point = new THREE.Vector3().fromBufferAttribute(positions,0);
    frame.updateMatrixWorld(true);
    const before = dust.root.localToWorld(point.clone());
    pivot.rotation.y = 1.8;
    frame.updateMatrixWorld(true);
    assert.ok(before.distanceTo(dust.root.localToWorld(point.clone())) < 1e-8);
    for (const points of dust.root.children) {
        assert.equal(points.material.depthTest,true);
        assert.equal(points.material.depthWrite,false);
        assert.ok(points.material.uniforms.uGold.value.equals(new THREE.Color(GOLDEN_LIGHT.halo)));
    }
});

test('airborne dust freezes for reduced motion and resizes without regenerating particle positions', () => {
    const dust = createTreeAtmosphere(new THREE.Group(),new THREE.Vector3(6.6,5,6.2));
    const geometry = dust.root.children[1].geometry;
    const original = geometry.getAttribute('position').array.slice();
    assert.equal(dust.update(1200,false),true);
    assert.equal(dust.update(1210,false),false);
    dust.resize(1080);
    dust.update(2000,true);
    assert.equal(dust.update(3000,true),false);
    for (const points of dust.root.children) {
        assert.equal(points.material.uniforms.uTime.value,0);
        assert.equal(points.material.uniforms.uViewportHeight.value,1080);
    }
    assert.equal(dust.root.children[1].geometry,geometry);
    assert.deepEqual(geometry.getAttribute('position').array,original);
});
