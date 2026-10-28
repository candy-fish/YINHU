import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { deerRig } from '../transition/images/companion-art.js';
import { legPose, gallopFootPosition, gallopBodyPose } from '../transition/images/companions.js';

async function load(role) {
  const bytes = await readFile(new URL(`../transition/images/assets/${role}-companion.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  let arm, mesh;
  gltf.scene.traverse(object => {
    if (object.userData.imagesRole === role) arm = object;
    if (object.isSkinnedMesh) mesh = object;
  });
  assert.ok(arm && mesh, `${role} has a real skeleton and skinned surface`);
  arm.updateMatrixWorld(true);
  return { arm, mesh, scene: gltf.scene };
}

test('the exported reference deer has a continuous weighted skin and a backwards crown', async () => {
  const { arm, mesh, scene } = await load('deer');
  assert.equal(arm.userData.imagesContinuousReference, true);
  assert.equal(scene.getObjectByName('Cube'), undefined, 'startup objects never enter the web asset');
  assert.equal(mesh.skeleton.bones.length, 22);
  assert.ok(mesh.morphTargetDictionary[arm.userData.imagesGrazeCorrective] !== undefined, 'grazing exports its neck volume corrective');
  const weights = mesh.geometry.attributes.skinWeight;
  const indices = mesh.geometry.attributes.skinIndex;
  let blendedLimbs = 0;
  const crown = new THREE.Box3();
  for (let i = 0; i < weights.count; i++) {
    let sum = 0, limbWeights = 0, headWeight = 0;
    for (let j = 0; j < 4; j++) {
      const weight = weights.getComponent(i, j);
      sum += weight;
      const name = mesh.skeleton.bones[indices.getComponent(i, j)].name;
      if (/^(upper|lower|thigh)-/.test(name) && weight > .05) limbWeights++;
      if (name === 'head') headWeight += weight;
    }
    assert.ok(Number.isFinite(sum) && Math.abs(sum - 1) < .0001);
    if (limbWeights > 1) blendedLimbs++;
    if (headWeight > .9) {
      const p = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld);
      if (p.y > 2.5) crown.expandByPoint(p);
    }
  }
  assert.ok(blendedLimbs > 150, 'the knee and hock deform across shared vertices');
  assert.ok(crown.min.x < -1.2 && crown.max.x < .65, 'branches sweep over the back, away from the muzzle');
});

test('the GLB bone bases reproduce the planted-hoof gait through a complete cycle', async () => {
  const { arm, mesh } = await load('deer');
  const neutral = JSON.parse(arm.userData.imagesNeutralAngles);
  const bones = new Map(mesh.skeleton.bones.map(bone => [bone.name, bone]));
  const rest = new Map(), axes = new Map();
  for (const bone of bones.values()) {
    rest.set(bone.name, bone.quaternion.clone());
    axes.set(bone.name, new THREE.Vector3(0, 0, -1).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()));
  }
  const body = bones.get('body'), bodyRest = body.position.clone();
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(body.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  for (let frame = 0; frame < 48; frame++) {
    const gait = frame / 48 * Math.PI * 2;
    const bob = 1.8 + Math.cos(gait * 2) * .45;
    body.position.copy(bodyRest).addScaledVector(down, bob / 100);
    const targets = deerRig.map(leg => ({ leg, angles: legPose(leg, gait, 1, bob) }));
    for (const { leg, angles } of targets) {
      for (const part of ['thigh', 'upper', 'lower', 'hoof']) {
        const name = `${part}-${leg.name}`, bone = bones.get(name);
        if (bone) bone.quaternion.copy(rest.get(name)).multiply(new THREE.Quaternion().setFromAxisAngle(axes.get(name), THREE.MathUtils.degToRad(angles[part] - neutral[leg.name][part])));
      }
    }
    arm.updateMatrixWorld(true);
    for (const { leg, angles } of targets) {
      const hoof = bones.get(`hoof-${leg.name}`).getWorldPosition(new THREE.Vector3());
      assert.ok(Math.hypot(hoof.x - (angles.foot[0] - 120) / 100, hoof.y - (282 - angles.foot[1]) / 100) < .001, `${leg.name} reaches its road contact`);
    }
  }
});

test('the fish has separate bones for the tail and both swimming fins', async () => {
  const { mesh } = await load('fish');
  assert.deepEqual(mesh.skeleton.bones.map(bone => bone.name).sort(), ['fish-body', 'fish-dorsal', 'fish-fin-far', 'fish-fin-near', 'fish-tail']);
});

test('running back correctives deform the trunk while preserving feet, neck and antlers', async () => {
  const { arm, mesh } = await load('deer');
  for (const name of [arm.userData.imagesRunCoil, arm.userData.imagesRunReach]) {
    assert.ok(name && mesh.morphTargetDictionary[name] !== undefined);
    const morph = mesh.geometry.morphAttributes.position[mesh.morphTargetDictionary[name]];
    const positions = mesh.geometry.attributes.position;
    let changed = 0, peak = 0;
    for (let i = 0; i < positions.count; i++) {
      const before = new THREE.Vector3().fromBufferAttribute(positions, i);
      const delta = new THREE.Vector3().fromBufferAttribute(morph, i);
      if (!mesh.geometry.morphTargetsRelative) delta.sub(before);
      const world = before.clone().applyMatrix4(mesh.matrixWorld);
      const displacement = delta.length();
      if (world.y < 1.04 || world.y > 1.9) assert.ok(displacement < .00001, 'hooves and head keep their original shape');
      if (displacement > .005) changed++;
      peak = Math.max(peak, displacement);
    }
    assert.ok(changed > 500, 'the back bends over a continuous area');
    assert.ok(peak > .02 && peak < .13, 'visible but controlled trunk deformation');
  }
});

test('the real deer rig reaches its galloping contacts while the torso pitches and rises', async () => {
  const { arm, mesh } = await load('deer');
  const neutral = JSON.parse(arm.userData.imagesNeutralAngles);
  const bones = new Map(mesh.skeleton.bones.map(bone => [bone.name, bone]));
  const rest = new Map(), axes = new Map();
  for (const bone of bones.values()) {
    rest.set(bone.name, bone.quaternion.clone());
    axes.set(bone.name, new THREE.Vector3(0, 0, -1).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()));
  }
  const body = bones.get('body'), bodyRest = body.position.clone();
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(body.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  for (let frame = 0; frame < 120; frame++) {
    const gait = frame / 120 * Math.PI * 2, pose = gallopBodyPose(gait);
    body.position.copy(bodyRest).addScaledVector(down, pose.bob / 100);
    body.quaternion.copy(rest.get('body')).multiply(new THREE.Quaternion().setFromAxisAngle(axes.get('body'), THREE.MathUtils.degToRad(pose.tilt)));
    const targets = deerRig.map(leg => ({ leg, angles: legPose(leg, gait, 1, pose.bob, pose.tilt, 0, gallopFootPosition(leg, gait), 1) }));
    for (const { leg, angles } of targets) for (const part of ['thigh', 'upper', 'lower', 'hoof']) {
      const name = `${part}-${leg.name}`, bone = bones.get(name);
      if (bone) bone.quaternion.copy(rest.get(name)).multiply(new THREE.Quaternion().setFromAxisAngle(axes.get(name), THREE.MathUtils.degToRad(angles[part] - neutral[leg.name][part] - (part === 'hoof' ? pose.tilt : 0))));
    }
    arm.updateMatrixWorld(true);
    for (const { leg, angles } of targets) {
      const hoof = bones.get(`hoof-${leg.name}`).getWorldPosition(new THREE.Vector3());
      assert.ok(Math.hypot(hoof.x - (angles.foot[0] - 120) / 100, hoof.y - (282 - angles.foot[1]) / 100) < .001, `${leg.name} follows its gallop target at frame ${frame}`);
    }
  }
});

test('the Blender aurora has continuous upward curtains without returning or kinked lower edges', async () => {
  const bytes = await readFile(new URL('../transition/images/assets/aurora-curtains.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const curtains = [];
  gltf.scene.traverse(object => { if (object.userData.auroraRole === 'curtain') curtains.push(object); });
  assert.equal(curtains.length, 5);
  assert.deepEqual(new Set(curtains.map(mesh => mesh.userData.auroraTint)), new Set(['#EBCEE5', '#BBD7E5', '#BBDDC5', '#77718F', '#ECC5B9']));
  for (const mesh of curtains) {
    assert.ok(mesh.morphTargetDictionary['Flow A'] !== undefined && mesh.morphTargetDictionary['Flow B'] !== undefined);
    const { position, uv } = mesh.geometry.attributes;
    const lower = [], upper = [];
    for (let i = 0; i < position.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(position, i);
      if (uv.getY(i) > .999) lower.push(point);
      if (uv.getY(i) < .001) upper.push(point);
    }
    lower.sort((a, b) => a.x - b.x); upper.sort((a, b) => a.x - b.x);
    assert.equal(lower.length, upper.length);
    for (let i = 0; i < lower.length; i++) {
      assert.ok(upper[i].y - lower[i].y > 3, 'glTF V=1 is the luminous lower edge; rays extend upwards');
      if (i > 1) {
        const before = lower[i - 1].clone().sub(lower[i - 2]);
        const after = lower[i].clone().sub(lower[i - 1]);
        assert.ok(before.x > 0 && after.x > 0, 'no folded-back seams');
        assert.ok(before.angleTo(after) < .025, 'the lower sweep has no abrupt changes of direction');
      }
    }
  }
});
