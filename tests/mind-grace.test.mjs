import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGraceGuidance, createGuidancePaths } from '../transition/mind/grace-guidance.js';
import { GOLDEN_LIGHT } from '../transition/mind/golden-light.js';

test('guiding currents converge on the grace and use sparse grains with depth occlusion', () => {
    const parent = new THREE.Group();
    const guidance = createGraceGuidance(parent);
    const [halo, grains] = guidance.root.children;
    assert.equal(parent.children[0], guidance.root);
    assert.equal(halo.geometry, grains.geometry);
    const geometry = grains.geometry;
    const texture = grains.material.uniforms.uPaths.value;
    const routes = geometry.getAttribute('aRoute');
    const counts = Array(texture.image.height + 1).fill(0);
    for (let index = 0; index < routes.count; index++) {
        counts[routes.getX(index)]++;
        const progress = geometry.getAttribute('aProgress').getX(index);
        assert.ok(progress >= 0 && progress < 1);
    }
    assert.ok(counts.every(count => count > 0));
    assert.ok(counts.at(-1) < counts[0]);
    assert.equal(texture, halo.material.uniforms.uPaths.value);
    for (let route = 0; route < texture.image.height; route++) {
        const index = (route * texture.image.width + texture.image.width - 1) * 4;
        const end = new THREE.Vector3().fromArray(texture.image.data, index);
        assert.ok(end.distanceTo(new THREE.Vector3(-1.5, 0.6, 1.08)) < 1e-6);
    }
    for (const points of [halo, grains]) {
        assert.equal(points.material.depthTest, true);
        assert.equal(points.material.depthWrite, false);
        assert.equal(points.material.blending, THREE.AdditiveBlending);
        assert.ok(points.material.uniforms.uGold.value.equals(new THREE.Color(GOLDEN_LIGHT.halo)));
    }
});

test('animation reuses geometry and honors reduced motion and viewport changes', () => {
    const guidance = createGraceGuidance(new THREE.Group());
    const grains = guidance.root.children[1];
    const geometry = grains.geometry;
    const original = geometry.getAttribute('position').array.slice();
    guidance.update(18.5, false, 1080);
    for (const points of guidance.root.children) {
        assert.equal(points.material.uniforms.uTime.value, 18.5);
        assert.equal(points.material.uniforms.uMotion.value, 1);
        if (points.material.uniforms.uViewportHeight) assert.equal(points.material.uniforms.uViewportHeight.value, 1080);
    }
    guidance.update(65, true, 620);
    for (const points of guidance.root.children) {
        assert.equal(points.material.uniforms.uTime.value, 0);
        assert.equal(points.material.uniforms.uMotion.value, 0);
        if (points.material.uniforms.uViewportHeight) assert.equal(points.material.uniforms.uViewportHeight.value, 620);
    }
    assert.equal(grains.geometry, geometry);
    assert.deepEqual(geometry.getAttribute('position').array, original);
});

test('open arcs preserve the earlier silhouette while adding front and back depth without abrupt turns', () => {
    const anchor = new THREE.Vector3(-1.5, 0.4, 1);
    const paths = createGuidancePaths(anchor);
    const silhouettes = [
        [[-3.05, 3.6], [-3.55, 2.2], [-1.7, 0.45], [0, 0.2]],
        [[3.3, 1.9], [3.7, 0.5], [1.7, -0.25], [0, 0.2]],
        [[-3.0, 0.95], [-2.7, 0.25], [-1.25, 0.12], [0, 0.2]]
    ];
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    for (const [route, curve] of paths.slice(0, 3).entries()) {
        const silhouette = new THREE.CubicBezierCurve(...silhouettes[route].map(point => new THREE.Vector2(...point)));
        let previousTangent = curve.getTangentAt(0);
        for (let step = 0; step <= 100; step++) {
            const t = step / 100;
            const point = curve.getPointAt(t);
            const shape = silhouette.getPoint(t);
            const local = curve.getPoint(t).sub(anchor);
            assert.ok(new THREE.Vector2(local.x, local.y).distanceTo(shape) < 1e-8);
            minDepth = Math.min(minDepth, point.z);
            maxDepth = Math.max(maxDepth, point.z);
            const tangent = curve.getTangentAt(t);
            assert.ok(tangent.angleTo(previousTangent) < THREE.MathUtils.degToRad(15));
            previousTangent = tangent;
        }
    }
    assert.ok(minDepth < -1 && maxDepth > 2);
});

test('two additional reference strokes rise above the crown and curl around the right with smooth joins', () => {
    const anchor = new THREE.Vector3(-1.5, 0.4, 1);
    const paths = createGuidancePaths(anchor);
    assert.equal(paths.length, 5);
    const left = paths[3];
    const right = paths[4];
    assert.ok(left.getPoint(0).y - anchor.y > 5.5);
    assert.ok(right.getPoint(0).x - anchor.x >= 4.9);
    for (const path of [left, right]) {
        for (let segment = 0; segment < path.curves.length - 1; segment++) {
            const before = path.curves[segment];
            const after = path.curves[segment + 1];
            assert.ok(before.getPoint(1).distanceTo(after.getPoint(0)) < 1e-8);
            const incoming = before.v3.clone().sub(before.v2);
            const outgoing = after.v1.clone().sub(after.v0);
            assert.ok(incoming.angleTo(outgoing) < 1e-6);
        }
        assert.ok(path.getPoint(1).distanceTo(anchor.clone().add(new THREE.Vector3(0, 0.2, 0.08))) < 1e-8);
    }
});

test('orbits rotate with the tree, keep the grace endpoint and are occluded behind the trunk', () => {
    const pivot = new THREE.Group();
    const anchor = new THREE.Vector3(-1.5, 0.4, 1);
    const guidance = createGraceGuidance(pivot, anchor);
    const paths = createGuidancePaths(anchor);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 4, 32), new THREE.MeshBasicMaterial());
    trunk.position.y = 2;
    pivot.add(trunk);
    const camera = new THREE.Vector3(0, 3, 12);
    const ray = new THREE.Raycaster();
    for (const yaw of [0, 0.7, 1.6, 2.8]) {
        pivot.rotation.y = yaw;
        pivot.updateMatrixWorld(true);
        const expectedEnd = pivot.localToWorld(anchor.clone().add(new THREE.Vector3(0, 0.2, 0.08)));
        for (const path of paths) {
            const end = guidance.root.localToWorld(path.getPointAt(1));
            assert.ok(end.distanceTo(expectedEnd) < 1e-8);
        }
        let occluded = 0;
        let visible = 0;
        for (const path of paths) {
            for (let step = 0; step < 256; step++) {
                const point = guidance.root.localToWorld(path.getPointAt(step / 255));
                ray.set(camera, point.clone().sub(camera).normalize());
                const hit = ray.intersectObject(trunk)[0];
                if (hit && hit.distance < camera.distanceTo(point)) occluded++;
                else visible++;
            }
        }
        assert.ok(visible > 0);
        if (yaw === 0) assert.ok(occluded > 0, 'the rear arc must pass behind the trunk');
    }
    trunk.geometry.dispose();
    trunk.material.dispose();
});

test('white mist has continuous ribbons, respects tree depth and freezes with the particles', () => {
    const guidance = createGraceGuidance(new THREE.Group());
    const mist = guidance.root.getObjectByName('grace-floating-silk-mist');
    assert.ok(mist.isMesh);
    assert.equal(mist.material.depthTest, true);
    assert.equal(mist.material.depthWrite, false);
    assert.equal(mist.material.side, THREE.DoubleSide);
    const positions = mist.geometry.getAttribute('position');
    for (const index of mist.geometry.index.array) assert.ok(index < positions.count);
    const routes = new Set(mist.geometry.getAttribute('aRoute').array);
    assert.deepEqual([...routes], [0, 1, 2, 3, 4]);
    guidance.update(27, true, 720);
    assert.equal(mist.material.uniforms.uTime.value, 0);
    assert.equal(mist.material.uniforms.uMotion.value, 0);
});
