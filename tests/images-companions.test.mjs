import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotionState, advanceMotion, idlePose, footPosition, gallopFootPosition, gallopBodyPose, legPose, solveLeg } from '../transition/images/companions.js';
import { deerRig } from '../transition/images/companion-art.js';

const dt = 1 / 60;
const view = { camera: 0, scale: .7, width: 900, dt };
const close = (actual, expected, tolerance = 1e-7) => assert.ok(
  Math.abs(actual - expected) < tolerance,
  `expected ${actual} to be within ${tolerance} of ${expected}`
);

function travel(state, start, velocity, frames = 60, options = {}) {
  let camera = start, pose;
  for (let frame = 0; frame < frames; frame++) {
    camera += velocity * dt;
    pose = advanceMotion(state, { ...view, ...options, camera });
  }
  return { camera, pose };
}

function endpoint(hip, angles, upper, lower) {
  const first = angles.upper * Math.PI / 180;
  const second = (angles.upper + angles.lower) * Math.PI / 180;
  return [
    hip[0] - Math.sin(first) * upper - Math.sin(second) * lower,
    hip[1] + Math.cos(first) * upper + Math.cos(second) * lower
  ];
}

function articulatedEndpoint(leg, angles, bob = 0, tilt = 0) {
  const thigh = angles.thigh * Math.PI / 180;
  const joint = [
    leg.hip[0] - Math.sin(thigh) * (leg.thigh || 0),
    leg.hip[1] + Math.cos(thigh) * (leg.thigh || 0)
  ];
  const local = endpoint(joint, { upper: angles.thigh + angles.upper, lower: angles.lower }, leg.upper, leg.lower);
  const bodyAngle = tilt * Math.PI / 180;
  const dx = local[0] - 100, dy = local[1] - 160;
  return [100 + dx * Math.cos(bodyAngle) - dy * Math.sin(bodyAngle), 160 + dx * Math.sin(bodyAngle) + dy * Math.cos(bodyAngle) + bob];
}

test('timeline movement starts a gait and reversing travel turns the deer', () => {
  const state = createMotionState();
  assert.equal(advanceMotion(state, view).mode, 'standing');
  const forward = travel(state, 0, 25);
  assert.equal(forward.pose.mode, 'walking');
  assert.ok(forward.pose.walk > .95);
  assert.ok(forward.pose.facing > .95);
  const forwardGait = state.gait;
  const reverse = travel(state, forward.camera, -25);
  assert.equal(reverse.pose.mode, 'walking');
  assert.ok(reverse.pose.facing < -.95);
  assert.notEqual(state.gait, forwardGait);
  const samples = Array.from({ length: 60 }, (_, index) => footPosition(deerRig[0], index / 60 * Math.PI * 2, reverse.pose.walk));
  assert.ok(Math.max(...samples.map(foot => foot[0])) - Math.min(...samples.map(foot => foot[0])) > 28);
  assert.ok(Math.min(...samples.map(foot => foot[1])) < deerRig[0].foot[1] - 6);
});

test('after travel stops, all four hooves return to a stable standing pose', () => {
  const state = createMotionState();
  advanceMotion(state, view);
  const moving = travel(state, 0, 220);
  const stopped = travel(state, moving.camera, 0, 180);
  assert.equal(stopped.pose.mode, 'standing');
  assert.equal(stopped.pose.walk, 0);
  for (const [index, leg] of deerRig.entries()) {
    const foot = stopped.pose.feet[index];
    assert.deepEqual(foot, leg.foot);
    assert.deepEqual(footPosition(leg, state.gait + 1, stopped.pose.walk), foot);
    const actual = articulatedEndpoint(leg, legPose(leg, state.gait, 0, 0, 0, 0, foot));
    close(actual[0], foot[0], .01);
    close(actual[1], foot[1], .01);
  }
});

test('stopping finishes the current steps and plants the four hooves at staggered times', () => {
  const state = createMotionState();
  advanceMotion(state, view);
  const moving = travel(state, 0, 30, 75);
  let previous = moving.pose.feet;
  const lastRaised = new Map();
  for (let frame = 0; frame < 90; frame++) {
    const pose = advanceMotion(state, { ...view, camera: moving.camera });
    pose.feet.forEach((foot, index) => {
      const leg = deerRig[index];
      assert.ok(Math.hypot(foot[0] - previous[index][0], foot[1] - previous[index][1]) < 4, `${leg.name} lands without a position jump`);
      if (Math.abs(foot[0] - leg.foot[0]) > .02 || Math.abs(foot[1] - leg.foot[1]) > .02) lastRaised.set(leg.name, frame);
    });
    previous = pose.feet;
  }
  assert.deepEqual(previous, deerRig.map(leg => leg.foot));
  assert.equal(lastRaised.size, 4);
  assert.ok(new Set(lastRaised.values()).size >= 3, 'the hooves finish planting at different times');
  assert.ok(Math.max(...lastRaised.values()) - Math.min(...lastRaised.values()) >= 15, 'planting is visibly staggered');
  assert.ok(state.idleTime < 1, 'idle gestures wait for the feet to land');
});

test('a walking cycle has four ordered footfalls and always at least two supporting hooves', () => {
  const steps = 720;
  const landings = [];
  const previous = deerRig.map(leg => footPosition(leg, -Math.PI * 2 / steps, 1)[1] < leg.foot[1] - .001);
  for (let sample = 0; sample < steps; sample++) {
    let supporting = 0;
    deerRig.forEach((leg, index) => {
      const foot = footPosition(leg, sample / steps * Math.PI * 2, 1);
      const raised = foot[1] < leg.foot[1] - .001;
      if (!raised) supporting++;
      if (previous[index] && !raised) landings.push(leg.name);
      previous[index] = raised;
    });
    assert.ok(supporting >= 2, `only ${supporting} supporting hooves at cycle sample ${sample}`);
  }
  assert.deepEqual(landings, ['hind-near', 'front-near', 'hind-far', 'front-far']);
  for (const leg of deerRig) {
    const samples = Array.from({ length: steps }, (_, index) => footPosition(leg, index / steps * Math.PI * 2, 1));
    const stride = Math.max(...samples.map(foot => foot[0])) - Math.min(...samples.map(foot => foot[0]));
    const lift = leg.foot[1] - Math.min(...samples.map(foot => foot[1]));
    assert.ok(stride >= 28 && stride <= 36, `${leg.name} has a restrained stride`);
    assert.ok(lift > 6 && lift <= 12, `${leg.name} swings close to the ground`);
  }
});

test('the articulated hind and front chains keep hooves on their requested road positions', () => {
  const poses = [
    { gait: 0, walk: 0, bob: 0, tilt: 0, graze: 0 },
    { gait: 1, walk: 1, bob: 2, tilt: 0, graze: 0 },
    { gait: 3.6, walk: 1, bob: 2.2, tilt: 0, graze: 0 },
    { gait: 5.7, walk: .5, bob: 1.2, tilt: .4, graze: .3 },
    { gait: 0, walk: 0, bob: 3, tilt: 1.1, graze: 1 }
  ];
  for (const pose of poses) for (const leg of deerRig) {
    const angles = legPose(leg, pose.gait, pose.walk, pose.bob, pose.tilt, pose.graze);
    const actual = articulatedEndpoint(leg, angles, pose.bob, pose.tilt);
    close(actual[0], angles.foot[0], .05);
    close(actual[1], angles.foot[1], .05);
    close(angles.thigh + angles.upper + angles.lower + angles.hoof, 0);
  }
  const state = createMotionState();
  advanceMotion(state, view);
  let camera = 0;
  for (let frame = 0; frame < 240; frame++) {
    camera += 140 * dt;
    const pose = advanceMotion(state, { ...view, camera });
    deerRig.forEach((leg, index) => {
      const angles = legPose(leg, state.gait, pose.walk, pose.bob, pose.tilt, pose.graze, pose.feet[index]);
      const actual = articulatedEndpoint(leg, angles, pose.bob, pose.tilt);
      close(actual[0], angles.foot[0], .05);
      close(actual[1], angles.foot[1], .05);
    });
  }
});

test('idle behavior rests, looks around, pauses, grazes and returns to rest without sudden poses', () => {
  for (const seconds of [0, 1, 3, 8.5, 20.5, 28.9]) {
    const pose = idlePose(seconds);
    assert.equal(pose.action, 'resting');
    assert.equal(pose.graze, 0);
    close(pose.neck, 0);
    close(pose.head, 0);
  }
  const look = idlePose(5);
  assert.equal(look.action, 'looking');
  assert.equal(look.graze, 0);
  assert.ok(look.yaw < .95, 'looking changes the head direction');
  const grazing = idlePose(14);
  assert.equal(grazing.action, 'grazing');
  assert.ok(grazing.graze > .95 && grazing.neck > 90 && grazing.head < -40);
  assert.ok(Math.abs(grazing.chew - idlePose(14.2).chew) > .1, 'grazing includes a quiet chewing motion');
  let previous = idlePose(0);
  for (let frame = 1; frame <= 30 * 60; frame++) {
    const next = idlePose(frame * dt);
    assert.ok(Math.abs(next.neck - previous.neck) < 2);
    assert.ok(Math.abs(next.head - previous.head) < 2);
    previous = next;
  }
});

test('starting travel during grazing lifts the head smoothly before returning to the walking pose', () => {
  const state = createMotionState();
  const resting = travel(state, 0, 0, 14 * 60);
  assert.equal(resting.pose.idleAction, 'grazing');
  let camera = resting.camera, previous = resting.pose;
  for (let frame = 0; frame < 90; frame++) {
    const moving = travel(state, camera, 30, 1);
    assert.ok(Math.abs(moving.pose.neck - previous.neck) < 12, 'interrupted neck angle remains continuous');
    assert.ok(Math.abs(moving.pose.head - previous.head) < 8, 'interrupted head angle remains continuous');
    camera = moving.camera;
    previous = moving.pose;
  }
  assert.equal(previous.mode, 'walking');
  assert.ok(Math.abs(previous.neck) < 3);
  assert.ok(previous.graze < .02);
});

test('pausing freezes the idle sequence and fish orbit', () => {
  const state = createMotionState();
  const resting = travel(state, 0, 0, 14 * 60);
  const clocks = { idleTime: state.idleTime, elapsed: state.elapsed, gait: state.gait, orbit: state.orbit, swim: state.swim };
  const paused = travel(state, resting.camera, 0, 120, { paused: true });
  for (const key of Object.keys(clocks)) assert.equal(state[key], clocks[key]);
  for (const key of ['neck', 'head', 'graze', 'fishX', 'fishY', 'tail', 'fin']) close(paused.pose[key], resting.pose[key]);
});

test('while standing, the fish swims around the deer and passes in front and behind', () => {
  const state = createMotionState();
  const samples = Array.from({ length: 14 * 60 }, () => advanceMotion(state, view));
  assert.ok(samples.every(pose => pose.mode === 'standing'));
  const xs = samples.map(pose => pose.fishX);
  const ys = samples.map(pose => pose.fishY);
  const depths = samples.map(pose => pose.fishDepth);
  assert.ok(Math.min(...xs) < -55 && Math.max(...xs) > 55, 'fish visits both sides of the deer by more than its body width');
  assert.ok(Math.max(...ys) - Math.min(...ys) > 28, 'orbit has vertical travel');
  assert.ok(Math.min(...depths) < -.9 && Math.max(...depths) > .9, 'orbit crosses the deer depth plane');
  const left = samples.reduce((a, b) => a.fishX < b.fishX ? a : b);
  const right = samples.reduce((a, b) => a.fishX > b.fishX ? a : b);
  assert.ok(Math.abs(left.fishY - right.fishY) < 2, 'left and right orbit extremes have similar height');
  assert.ok(Math.max(...samples.map(pose => pose.tail)) - Math.min(...samples.map(pose => pose.tail)) > 20, 'tail keeps swimming at rest');
});

test('large range jumps leave the companions behind, with bounded motion and eventual catch-up', () => {
  for (const size of [{ width: 390, scale: .4 }, { width: 900, scale: .7 }, { width: 1440, scale: 1 }]) {
    const state = createMotionState();
    const initial = advanceMotion(state, { ...view, ...size, camera: 0 });
    let previous = initial;
    for (const camera of [700, 0]) {
      let first;
      for (let frame = 0; frame < 780; frame++) {
        const pose = advanceMotion(state, { ...view, ...size, camera, interacting: true });
        if (!frame) first = pose;
        assert.ok(Math.abs(pose.x - previous.x) <= 280 * dt + .00001, 'the timeline cannot teleport or over-speed the animals');
        assert.ok(Math.abs(pose.speed) <= 280.001);
        assert.ok(pose.excitement <= 1);
        previous = pose;
      }
      assert.ok(Math.abs(first.lag) > 500, 'both forward and reverse jumps create visible lag');
      close(previous.lag, 0, .001);
      close(previous.x * size.scale - camera, initial.x * size.scale, .001);
      assert.equal(previous.mode, 'standing');
    }
  }
});

test('fast panning keeps a natural running cadence and the fish keeps swimming during catch-up', () => {
  const state = createMotionState(); advanceMotion(state, view);
  const fast = travel(state, 0, 1000, 60);
  assert.ok(fast.pose.lag > 900);
  assert.equal(fast.pose.mode, 'running');
  let previous = fast.pose, turns = 0;
  const tails = [];
  for (let frame = 0; frame < 60; frame++) {
    const gait = state.gait;
    const pose = advanceMotion(state, { ...view, camera: fast.camera, interacting: true });
    assert.ok(pose.x > previous.x, 'the deer continues catching up after the page stops');
    assert.equal(pose.mode, 'running');
    assert.ok(pose.lag < previous.lag);
    assert.ok(Math.abs((pose.x + pose.fishX) - pose.x) < 110, 'fish stays with the pursuing deer');
    tails.push(pose.tail);
    turns += (state.gait - gait + Math.PI * 2) % (Math.PI * 2);
    previous = pose;
  }
  assert.ok(turns / (Math.PI * 2) <= 1.401, 'drag speed cannot rush the stride cycle');
  assert.ok(Math.max(...tails) - Math.min(...tails) > 40, 'fish still swims energetically while catching up');
});

test('pause freezes a chase and resize or reduced motion reanchors without inventing a sprint', () => {
  const state = createMotionState(); advanceMotion(state, view);
  const fast = travel(state, 0, 1000, 60);
  const frozen = advanceMotion(state, { ...view, camera: fast.camera + 200, paused: true });
  close(frozen.x, fast.pose.x); close(frozen.speed, fast.pose.speed);
  const resumed = advanceMotion(state, { ...view, camera: fast.camera + 200 });
  assert.ok(resumed.x - frozen.x <= 280 * dt + .00001);
  const resized = advanceMotion(state, { ...view, camera: 300, width: 390, scale: .4, reset: true });
  close(resized.lag, 0); assert.equal(resized.run, 0); assert.equal(resized.speed, 0);
  const reduced = advanceMotion(state, { ...view, camera: 1000, reduced: true });
  close(reduced.lag, 0); assert.equal(reduced.mode, 'standing');
});

test('resetting camera measurement during a resize does not invent travel', () => {
  const state = createMotionState();
  advanceMotion(state, { ...view, camera: 1000 });
  const gait = state.gait;
  const pose = advanceMotion(state, { ...view, camera: 2200, scale: .4, width: 390, reset: true });
  assert.equal(pose.mode, 'standing');
  assert.equal(pose.walk, 0);
  assert.equal(state.gait, gait);
  close(pose.x * .4 - 2200, 390 * .42);
});

test('reduced motion freezes the gait and fish orbit even when the timeline changes', () => {
  const state = createMotionState();
  advanceMotion(state, view);
  const moving = travel(state, 0, 100);
  const frozen = { gait: state.gait, orbit: state.orbit, swim: state.swim, elapsed: state.elapsed };
  const reduced = travel(state, moving.camera, -200, 90, { reduced: true });
  for (const key of Object.keys(frozen)) assert.equal(state[key], frozen[key]);
  assert.equal(reduced.pose.mode, 'standing');
  assert.equal(reduced.pose.bob, 0);
  assert.equal(reduced.pose.tail, 0);
  assert.equal(reduced.pose.fin, 0);
});

test('leg inverse kinematics reaches targets and safely clamps unreachable ones', () => {
  const hip = [25, 40], upper = 55, lower = 65;
  for (const bend of [-1, 1]) {
    for (const offset of [[0, 100], [30, 70], [-35, 85], [0, 20], [65, 0]]) {
      const requested = offset.map((value, axis) => value + hip[axis]);
      const actual = endpoint(hip, solveLeg(hip, requested, upper, lower, bend), upper, lower);
      close(actual[0], requested[0]);
      close(actual[1], requested[1]);
    }
    for (const requested of [[25, 40], [25, 1040], [-1000, -200]]) {
      const angles = solveLeg(hip, requested, upper, lower, bend);
      assert.ok(Number.isFinite(angles.upper) && Number.isFinite(angles.lower));
      const actual = endpoint(hip, angles, upper, lower);
      const distance = Math.hypot(actual[0] - hip[0], actual[1] - hip[1]);
      assert.ok(distance >= Math.abs(upper - lower) && distance <= upper + lower);
    }
  }
});

test('fast travel blends into a gallop, slowing returns to walking, and a jump starts a bounded chase', () => {
  const state = createMotionState();
  advanceMotion(state, view);
  const walking = travel(state, 0, 30);
  assert.equal(walking.pose.mode, 'walking');
  assert.equal(walking.pose.run, 0);
  let camera = walking.camera, previous = walking.pose, peakStep = 0;
  for (let frame = 0; frame < 90; frame++) {
    const fast = travel(state, camera, 180, 1);
    assert.ok(Math.abs(fast.pose.run - previous.run) < .10, 'gait transition stays continuous');
    fast.pose.feet.forEach((foot, index) => {
      peakStep = Math.max(peakStep, Math.hypot(foot[0] - previous.feet[index][0], foot[1] - previous.feet[index][1]));
    });
    camera = fast.camera; previous = fast.pose;
  }
  assert.equal(previous.mode, 'running');
  assert.ok(previous.run > .99);
  assert.ok(peakStep < 25, `the larger jump stays continuous while changing gaits (${peakStep})`);
  const slow = travel(state, camera, 25, 120);
  assert.equal(slow.pose.mode, 'walking');
  assert.equal(slow.pose.run, 0);
  const isolated = createMotionState(); advanceMotion(isolated, view);
  const jump = advanceMotion(isolated, { ...view, camera: 1000 });
  assert.equal(jump.run, 0);
  const after = travel(isolated, 1000, 0, 60);
  assert.equal(after.pose.mode, 'rebuilding');
  assert.ok(after.pose.reveal > 0 && after.pose.reveal < 1, 'offscreen animals reappear gradually after the jump stops');
  assert.equal(after.pose.lag, 0);
});

test('offscreen animals wait for release, then relocate invisibly and reconstruct once', () => {
  for (const camera of [1200, -1200]) {
    const state = createMotionState(); const initial = advanceMotion(state, view);
    let pose;
    for (let frame = 0; frame < 30; frame++) {
      pose = advanceMotion(state, { ...view, camera, interacting: true });
      assert.equal(pose.reveal, 1); assert.equal(pose.rebuildCount, 0, 'never teleport during an active drag');
    }
    let previous = pose, appeared = false;
    for (let frame = 0; frame < 240; frame++) {
      pose = advanceMotion(state, { ...view, camera });
      if (pose.rebuildCount > previous.rebuildCount) {
        assert.ok(frame >= 18, 'wait for a short stable pause');
        const oldX = previous.x * view.scale - camera;
        assert.ok(oldX < -150 * view.scale || oldX > view.width + 150 * view.scale, 'the previous projection is entirely outside the view');
        assert.equal(pose.reveal, 0, 'the relocation itself is invisible');
        close(pose.x * view.scale - camera, initial.x * view.scale);
        assert.equal(pose.walk, 0); assert.equal(pose.run, 0);
        appeared = true;
      } else if (appeared) assert.ok(pose.reveal >= previous.reveal, 'the outline fills continuously');
      previous = pose;
    }
    assert.ok(appeared); assert.equal(pose.rebuildCount, 1);
    assert.equal(pose.reveal, 1); assert.equal(pose.mode, 'standing');
    assert.deepEqual(pose.feet, deerRig.map(leg => leg.foot));
  }
});

test('a visible pursuit never teleports and reconstruction respects pause, resize and reduced motion', () => {
  const visible = createMotionState(); advanceMotion(visible, view);
  const caught = travel(visible, 150, 0, 180);
  assert.equal(caught.pose.rebuildCount, 0);
  const state = createMotionState(); advanceMotion(state, view);
  let pose = travel(state, 1200, 0, 60).pose;
  assert.equal(pose.mode, 'rebuilding');
  const paused = travel(state, 1200, 0, 60, { paused: true }).pose;
  close(paused.reveal, pose.reveal); close(paused.x, pose.x);
  const reduced = advanceMotion(state, { ...view, camera: 2000, reduced: true });
  assert.equal(reduced.reveal, 1); assert.equal(reduced.mode, 'standing');
  const reset = advanceMotion(state, { ...view, camera: 0, reset: true });
  assert.equal(reset.reveal, 1); close(reset.lag, 0);
});

test('moving again during reconstruction does not teleport again or over-speed the next pursuit', () => {
  const state = createMotionState(); advanceMotion(state, view);
  const first = travel(state, 1200, 0, 60);
  assert.equal(first.pose.mode, 'rebuilding');
  let previous = first.pose;
  for (let frame = 0; frame < 420; frame++) {
    const pose = advanceMotion(state, { ...view, camera: 500, interacting: true });
    assert.equal(pose.rebuildCount, 1);
    assert.ok(Math.abs(pose.x - previous.x) <= 280 * dt + .00001);
    previous = pose;
  }
  assert.ok(Math.abs(previous.lag) < 10, 'the completed projection resumes pursuing the new view');
});

test('a same-side bound has paired contacts, gathered suspension and reachable three-part hind legs', () => {
  const steps = 720, landings = [];
  const previous = deerRig.map(leg => gallopFootPosition(leg, -Math.PI * 2 / steps)[1] < leg.foot[1] - .001);
  let airborne = 0, minBob = Infinity, maxBob = -Infinity;
  for (let sample = 0; sample < steps; sample++) {
    const gait = sample / steps * Math.PI * 2, body = gallopBodyPose(gait);
    let supporting = 0;
    deerRig.forEach((leg, index) => {
      const foot = gallopFootPosition(leg, gait);
      assert.ok(foot[1] <= leg.foot[1] + .0001, 'no hoof goes through the road');
      const raised = foot[1] < leg.foot[1] - .001;
      if (!raised) supporting++;
      if (previous[index] && !raised) landings.push(leg.name);
      previous[index] = raised;
      const angles = legPose(leg, gait, 1, body.bob, body.tilt, 0, foot, 1);
      const actual = articulatedEndpoint(leg, angles, body.bob, body.tilt);
      close(actual[0], foot[0], .05);
      close(actual[1], foot[1], .05);
    });
    if (!supporting) airborne++;
    minBob = Math.min(minBob, body.bob); maxBob = Math.max(maxBob, body.bob);
  }
  assert.deepEqual(landings, ['hind-near', 'front-near', 'hind-far', 'front-far']);
  assert.ok(airborne > steps * .52 && airborne < steps * .60, 'the longer bound spends over half its cycle in suspension');
  assert.ok(minBob < -48 && maxBob - minBob > 60, 'the torso clearly rises above the old small running bounce');
  for (const leg of deerRig.filter(leg => leg.name.startsWith('front'))) {
    assert.ok(gallopFootPosition(leg, .94 * Math.PI * 2)[0] > leg.foot[0] + 25, 'the forelegs reach out on descent as in the video');
  }
});

test('each side keeps its fore and hind stride together through push-off, gathering and descent', () => {
  for (let sample = 0; sample < 720; sample++) {
    const gait = sample / 720 * Math.PI * 2;
    for (const side of ['near', 'far']) {
      const fore = deerRig.find(leg => leg.name === `front-${side}`);
      const hind = deerRig.find(leg => leg.name === `hind-${side}`);
      const frontFoot = gallopFootPosition(fore, gait), hindFoot = gallopFootPosition(hind, gait);
      close(frontFoot[0] - fore.foot[0] - (hindFoot[0] - hind.foot[0]), gallopBodyPose(gait).air * 40);
      assert.ok(Math.abs(frontFoot[1] - hindFoot[1]) <= 4.001, 'lift timing stays paired, with only anatomical height differences');
      assert.equal(frontFoot[1] < fore.foot[1] - .001, hindFoot[1] < hind.foot[1] - .001, 'the pair shares contact and suspension');
    }
  }
});

test('a running deer lands smoothly and returns to idle after releasing the timeline', () => {
  const state = createMotionState(); advanceMotion(state, view);
  const running = travel(state, 0, 180, 100);
  let previous = running.pose;
  for (let frame = 0; frame < 150; frame++) {
    const pose = advanceMotion(state, { ...view, camera: running.camera });
    pose.feet.forEach((foot, index) => {
      const distance = Math.hypot(foot[0] - previous.feet[index][0], foot[1] - previous.feet[index][1]);
      assert.ok(distance < 25, `${deerRig[index].name} changes ${distance} at release frame ${frame}`);
      const leg = deerRig[index];
      const actual = articulatedEndpoint(leg, legPose(leg, state.gait, pose.walk, pose.bob, pose.tilt, pose.graze, foot, pose.run), pose.bob, pose.tilt);
      close(actual[0], foot[0], .1); close(actual[1], foot[1], .1);
    });
    previous = pose;
  }
  assert.equal(previous.mode, 'standing'); assert.equal(previous.run, 0);
  assert.deepEqual(previous.feet, deerRig.map(leg => leg.foot));
});

test('the fish responds to running with stronger, faster strokes and wider vertical darts, then settles', () => {
  const sample = velocity => {
    const state = createMotionState(); advanceMotion(state, view);
    let { camera } = travel(state, 0, velocity, 120);
    const poses = []; let tailCrossings = 0;
    for (let frame = 0; frame < 120; frame++) {
      const next = travel(state, camera, velocity, 1); camera = next.camera;
      if (poses.length && poses.at(-1).tail < 0 && next.pose.tail >= 0) tailCrossings++;
      poses.push(next.pose);
    }
    const span = key => Math.max(...poses.map(pose => pose[key])) - Math.min(...poses.map(pose => pose[key]));
    return { state, camera, poses, span, tailCrossings };
  };
  const slow = sample(25), fast = sample(180);
  assert.ok(fast.span('tail') > slow.span('tail') * 1.4);
  assert.ok(fast.tailCrossings > slow.tailCrossings);
  assert.ok(fast.span('fishY') > slow.span('fishY') * 2);
  close(fast.poses[0].fishScale, slow.poses[0].fishScale, .001);
  const stopped = travel(fast.state, fast.camera, 0, 360);
  assert.equal(stopped.pose.excitement, 0);
});

test('moderate timeline travel already runs, with a visible jump and cadence increasing with speed', () => {
  const moderate = createMotionState(), faster = createMotionState();
  advanceMotion(moderate, view); advanceMotion(faster, view);
  const warm = travel(moderate, 0, 70, 120), warmFast = travel(faster, 0, 210, 120);
  assert.equal(warm.pose.mode, 'running');
  assert.ok(warm.pose.run > .64, 'running starts far below the previous high-speed threshold');
  let camera = warm.camera, fastCamera = warmFast.camera, minBob = Infinity, maxClearance = 0;
  let moderateTurns = 0, fastTurns = 0;
  for (let frame = 0; frame < 120; frame++) {
    const before = moderate.gait, beforeFast = faster.gait;
    const next = travel(moderate, camera, 70, 1), nextFast = travel(faster, fastCamera, 210, 1);
    camera = next.camera; fastCamera = nextFast.camera;
    moderateTurns += (moderate.gait - before + Math.PI * 2) % (Math.PI * 2);
    fastTurns += (faster.gait - beforeFast + Math.PI * 2) % (Math.PI * 2);
    minBob = Math.min(minBob, next.pose.bob);
    maxClearance = Math.max(maxClearance, Math.min(...next.pose.feet.map((foot, i) => deerRig[i].foot[1] - foot[1])));
  }
  assert.ok(minBob < -25, 'the torso rise is visible even in the earlier running range');
  assert.ok(maxClearance > 45, 'all four hooves clearly clear the road together');
  assert.ok(fastTurns > moderateTurns * 1.25, 'faster animal travel is matched by a faster stride');
  assert.ok(fastTurns / (Math.PI * 2 * 2) <= 1.401, 'the running cadence has a comfortable upper bound');
});

test('releasing at any jump phase finishes the airborne motion without snapping or breaking leg reach', () => {
  for (const phase of [.04, .2, .4, .58, .66, .79, .9, .97]) {
    const state = createMotionState(); advanceMotion(state, view);
    const warmed = travel(state, 0, 180, 120);
    state.gait = phase * Math.PI * 2;
    const start = travel(state, warmed.camera, 180, 1);
    let previous = start.pose;
    for (let frame = 0; frame < 180; frame++) {
      const pose = advanceMotion(state, { ...view, camera: start.camera });
      if (!frame && start.pose.air > .1 && Math.abs(state.followSpeed) < 2) {
        assert.ok(state.landing, 'release during flight retains a landing phase');
        close(pose.run, start.pose.run, .001);
      }
      assert.ok(Math.abs(pose.bob - previous.bob) < 21, `torso snap at phase ${phase}, frame ${frame}`);
      pose.feet.forEach((foot, index) => {
        const leg = deerRig[index];
        assert.ok(foot[1] <= leg.foot[1] + .001);
        assert.ok(Math.hypot(foot[0] - previous.feet[index][0], foot[1] - previous.feet[index][1]) < 28);
        const angles = legPose(leg, state.gait, pose.walk, pose.bob, pose.tilt, pose.graze, foot, pose.run);
        const actual = articulatedEndpoint(leg, angles, pose.bob, pose.tilt);
        close(actual[0], angles.foot[0], .15); close(actual[1], angles.foot[1], .15);
      });
      previous = pose;
    }
    assert.equal(previous.mode, 'standing'); assert.equal(state.landing, false);
    assert.deepEqual(previous.feet, deerRig.map(leg => leg.foot));
  }
});

test('pause and reduced motion also freeze the running response and excited fish', () => {
  const state = createMotionState(); advanceMotion(state, view);
  const moving = travel(state, 0, 180, 100);
  const clocks = { gait: state.gait, orbit: state.orbit, swim: state.swim, dart: state.dart, elapsed: state.elapsed };
  const paused = travel(state, moving.camera, 0, 60, { paused: true });
  for (const key of Object.keys(clocks)) assert.equal(state[key], clocks[key]);
  for (const key of ['run', 'walk', 'excitement', 'fishX', 'fishY', 'fishBend', 'tail', 'fin', 'bob', 'coil', 'reach', 'neckSpring']) close(paused.pose[key], moving.pose[key]);
  const reduced = advanceMotion(state, { ...view, camera: moving.camera + 1000, reduced: true });
  assert.equal(reduced.mode, 'standing'); assert.equal(reduced.run, 0); assert.equal(reduced.excitement, 0);
  assert.equal(reduced.tail, 0); assert.equal(reduced.fishBend, 0);
  for (const key of ['coil', 'reach', 'neckSpring']) assert.equal(Math.abs(reduced[key]), 0);
  assert.deepEqual(reduced.feet, deerRig.map(leg => leg.foot));
});

test('the early running range uses paired strides and coordinated trunk collection', () => {
  const state = createMotionState(); advanceMotion(state, view);
  let { camera } = travel(state, 0, 70, 120);
  let minCoil = 1, maxCoil = 0, minSpring = Infinity, maxSpring = -Infinity;
  for (let frame = 0; frame < 120; frame++) {
    const next = travel(state, camera, 70, 1); camera = next.camera;
    const pose = next.pose;
    for (const side of ['near', 'far']) {
      const front = deerRig.findIndex(leg => leg.name === `front-${side}`);
      const hind = deerRig.findIndex(leg => leg.name === `hind-${side}`);
      close(pose.feet[front][0] - deerRig[front].foot[0] - (pose.feet[hind][0] - deerRig[hind].foot[0]), pose.air * 40);
    }
    assert.ok(pose.coil >= 0 && pose.coil <= 1 && pose.reach >= 0 && pose.reach <= 1);
    if (pose.air > .5) assert.ok(pose.coil > .24 && pose.coil < .55 && pose.reach > pose.coil, 'the back gathers gently while keeping an open silhouette');
    minCoil = Math.min(minCoil, pose.coil); maxCoil = Math.max(maxCoil, pose.coil);
    minSpring = Math.min(minSpring, pose.neckSpring); maxSpring = Math.max(maxSpring, pose.neckSpring);
  }
  assert.ok(maxCoil - minCoil > .25 && maxSpring - minSpring > 5, 'torso and neck move even before maximum speed');
  const stopped = travel(state, camera, 0, 240);
  for (const key of ['coil', 'reach', 'neckSpring']) close(stopped.pose[key], 0);
});

test('a sustained run covers a longer scene distance in each airborne bound', () => {
  for (const direction of [-1, 1]) {
    const state = createMotionState(); advanceMotion(state, view);
    let { camera } = travel(state, 0, direction * 210, 180);
    let takeoff = null, completed = 0;
    for (let frame = 0; frame < 240; frame++) {
      const next = travel(state, camera, direction * 210, 1); camera = next.camera;
      const pose = next.pose;
      const airborne = pose.air > .01;
      if (airborne && !takeoff) takeoff = { x: pose.x, time: frame * dt };
      if (!airborne && takeoff) {
        const duration = frame * dt - takeoff.time;
        // Discard the initial partial flight; measure complete takeoff/landing arcs.
        if (duration > .3) {
          assert.ok(duration < .5, 'a long bound still lands promptly');
          assert.ok(Math.abs(pose.x - takeoff.x) > 90, 'the deer travels over 90 scene units before landing');
          completed++;
        }
        takeoff = null;
      }
    }
    assert.ok(completed >= 4, 'several full bounds are measured in both directions');
  }
});

test('the airborne silhouette opens front to back without folding the legs tightly', () => {
  const gait = .72 * Math.PI * 2, body = gallopBodyPose(gait);
  const posed = deerRig.map(leg => {
    const foot = gallopFootPosition(leg, gait);
    return { leg, foot, angles: legPose(leg, gait, 1, body.bob, body.tilt, 0, foot, 1) };
  });
  for (const side of ['near', 'far']) {
    const fore = posed.find(p => p.leg.name === `front-${side}`);
    const hind = posed.find(p => p.leg.name === `hind-${side}`);
    assert.ok(fore.foot[0] - hind.foot[0] > fore.leg.foot[0] - hind.leg.foot[0] + 35, 'forefeet and hindfeet open away from each other');
  }
  for (const { leg, foot, angles } of posed) {
    assert.ok(Math.abs(angles.lower) < 95, `${leg.name} keeps an open knee/hock angle`);
    assert.ok(foot[1] - body.bob - leg.hip[1] > 80, 'legs extend below the lifted trunk instead of gathering against the belly');
  }
  assert.ok(body.reach > body.coil && body.coil < .55, 'the spine favors extension at the top of the bound');
});
