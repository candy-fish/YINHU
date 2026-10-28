import { deerArtwork, fishArtwork, deerRig } from './companion-art.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const blend = (from, to, amount) => from + (to - from) * amount;
const approach = (from, to, dt, duration) => blend(from, to, 1 - Math.exp(-dt / duration));
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const envelope = (time, start, rise, hold, fall) => smooth((time - start) / rise) * (1 - smooth((time - start - rise - hold) / fall));

export function createMotionState() {
  return { camera: null, position: null, followSpeed: 0, speed: 0, walk: 0, run: 0, runRequested: false, landing: false, fastTime: 0, fastSamples: 0, excitement: 0,
    gait: 0, direction: 1, facing: 1, orbit: .65, swim: 0, dart: 0, elapsed: 0, idleTime: 0,
    cameraStill: 0, rebuild: null, rebuildCount: 0,
    feet: deerRig.map(leg => [...leg.foot]), silence: 1, stepped: false, settling: null, idle: idlePose(0) };
}

// Rest first, then a short look around, another pause, and an unhurried graze.
export function idlePose(seconds) {
  const t = seconds % 29;
  const looking = envelope(t, 3.2, .9, 2.3, .9);
  const grazing = envelope(t, 10, 2.8, 4.2, 2.8);
  const lookWave = Math.sin(clamp((t - 3.2) / 4.1, 0, 1) * TAU);
  const chewing = grazing * smooth((t - 12.8) / .35) * (1 - smooth((t - 16.6) / .35));
  return {
    action: grazing > .02 ? 'grazing' : looking > .02 ? 'looking' : 'resting',
    graze: grazing,
    neck: grazing * 124 + looking * lookWave * 2.4,
    head: -grazing * 61 - looking * lookWave * 7,
    yaw: 1 - looking * (.12 + .15 * Math.sin((t - 3.2) * 1.6) ** 2),
    ear: looking * Math.sin((t - 3.2) * 2.4) * 12 + grazing * Math.sin(t * .7) * 3,
    chew: chewing * (.5 + .5 * Math.sin(t * 7)) * 1.1,
    eye: looking * lookWave * 1.15
  };
}

function advanceFeet(state, dt, moving, reduced, paused) {
  if (reduced) { state.feet = deerRig.map(leg => [...leg.foot]); state.settling = null; state.stepped = false; return; }
  if (paused) return;
  state.silence = moving ? 0 : state.silence + dt;
  if (state.silence < .12) {
    state.feet = deerRig.map(leg => {
      const walking = footPosition(leg, state.gait, state.walk);
      const running = gallopFootPosition(leg, state.gait, state.walk * state.run, blend(.85, 1.18, clamp(Math.abs(state.speed) / 330, 0, 1)));
      // Establish paired coordination by the early running range, rather than
      // leaving a residual four-beat walk superimposed on a visible jump.
      return walking.map((value, axis) => blend(value, running[axis], smooth(state.run / .55)));
    });
    state.settling = null; state.stepped = true;
    return;
  }
  if (state.stepped && !state.settling) {
    const order = deerRig.map((leg, index) => ({ index, lift: leg.foot[1] - state.feet[index][1], offset: Math.abs(state.feet[index][0] - leg.foot[0]) }))
      .sort((a, b) => b.lift - a.lift || b.offset - a.offset);
    state.settling = { time: 0, from: state.feet.map(foot => [...foot]), delay: order.reduce((list, item, rank) => { list[item.index] = rank * .16; return list; }, []) };
  }
  if (!state.settling) return;
  const settle = state.settling; settle.time += dt;
  state.feet = deerRig.map((leg, index) => {
    const t = clamp((settle.time - settle.delay[index]) / .24, 0, 1), amount = smooth(t);
    const from = settle.from[index];
    return [blend(from[0], leg.foot[0], amount), blend(from[1], leg.foot[1], amount) - Math.sin(t * Math.PI) * (from[1] > 281.8 ? 2.5 : 0)];
  });
  if (settle.time >= .73) { state.feet = deerRig.map(leg => [...leg.foot]); state.settling = null; state.stepped = false; }
}

// Follow the view with bounded travel instead of tying the animals to the
// camera. Fast drags can leave them behind; their own travel drives the gait.
export function advanceMotion(state, { camera, scale, width, dt, reduced = false, paused = false, reset = false, interacting = false }) {
  dt = clamp(dt || 1 / 60, 0, .05);
  const worldCamera = camera / scale;
  const anchor = clamp(width / scale * .42, 170, 650);
  const target = worldCamera + anchor;
  const cameraVelocity = state.camera === null ? 0 : (worldCamera - state.camera) * scale / dt;
  state.camera = worldCamera;
  let velocity = 0;
  let rematerialized = false;
  if (state.position === null || reset || reduced) {
    state.position = target; state.followSpeed = 0;
    state.cameraStill = 0; state.rebuild = null;
  } else if (!paused) {
    state.cameraStill = !interacting && Math.abs(cameraVelocity) < 6 ? state.cameraStill + dt : 0;
    const screenX = (state.position - worldCamera) * scale;
    // Wait until the whole deer/fish group has left the viewport. Holding a
    // stationary slider is still interaction, not permission to rematerialize.
    const outside = screenX < -150 * scale || screenX > width + 150 * scale;
    if (outside && state.rebuild === null && state.cameraStill >= .32) {
      state.position = target; state.followSpeed = 0; state.rebuild = 0;
      state.rebuildCount++; rematerialized = true;
    }
    if (state.rebuild !== null) {
      if (!rematerialized) state.rebuild += dt;
      if (state.rebuild >= 2.6) { state.rebuild = null; state.cameraStill = 0; }
    } else {
    const gap = target - state.position;
    const desired = clamp(gap / .22, -280, 280);
    state.followSpeed = approach(state.followSpeed, desired, dt, .10);
    let step = state.followSpeed * dt;
    // Brake at the destination, with no overshoot or endless tiny shuffling.
    if (Math.sign(step) === Math.sign(gap) && Math.abs(step) >= Math.abs(gap)) step = gap;
    if (Math.abs(gap) < .02 && Math.abs(state.followSpeed) < .5) step = gap;
    state.position += step;
    state.followSpeed = velocity = step / dt;
    }
  }
  if (reduced || reset || rematerialized) {
    state.speed = state.walk = state.run = state.excitement = state.fastTime = state.fastSamples = 0;
    state.runRequested = state.landing = false; state.facing = state.direction;
    state.feet = deerRig.map(leg => [...leg.foot]); state.settling = null;
    state.stepped = false; state.silence = 1;
    state.idleTime = 0; state.idle = idlePose(0);
  } else if (!paused) {
    state.speed = approach(state.speed, velocity, dt, Math.abs(velocity) > Math.abs(state.speed) ? .065 : .1);
    if (Math.abs(velocity) > 3) state.direction = Math.sign(velocity);
    const speed = Math.abs(state.speed);
    const activity = clamp((speed - 3) / 30, 0, 1);
    // Hysteresis and a short sustained-travel gate prevent threshold noise from
    // toggling the gait. A long chase after a slider jump legitimately runs.
    state.fastTime = speed > 80 ? state.fastTime + dt : Math.max(0, state.fastTime - dt * 2);
    if (Math.abs(velocity) > 80) state.fastSamples = Math.min(3, state.fastSamples + 1);
    if (state.fastTime >= .06 && state.fastSamples >= 2) state.runRequested = true;
    if (speed < 52) { state.runRequested = false; state.fastSamples = 0; }
    if (Math.abs(velocity) > 80) state.landing = false;
    const releasing = Math.abs(velocity) < 2 && state.silence < .12;
    if ((!state.runRequested || releasing) && !state.settling && state.run > .42 && gallopBodyPose(state.gait).air > .01) state.landing = true;
    const locomotion = state.landing ? Math.max(.95, activity) : activity;
    state.walk = approach(state.walk, locomotion, dt, locomotion > state.walk ? .1 : .13);
    if (state.walk < .003 && locomotion === 0) state.walk = 0;
    let running = state.runRequested ? .65 + .35 * smooth((speed - 80) / 180) : 0;
    if (state.landing) running = Math.max(running, state.run);
    state.run = approach(state.run, running, dt, running > state.run ? .18 : .2);
    if (state.run < .003 && running === 0) state.run = 0;
    const excited = Math.max(state.run, smooth((speed - 240) / 600));
    state.excitement = approach(state.excitement, excited, dt, excited > state.excitement ? .22 : .85);
    if (state.excitement < .003 && excited === 0) state.excitement = 0;
    state.facing = approach(state.facing, state.direction, dt, .1);
  }
  if (!paused && !reduced) {
    state.elapsed += dt;
    // Stride cadence follows the animals' speed, capped independently of the
    // camera so dragging harder cannot accelerate the pose beyond this range.
    const travelCadence = blend(clamp(.55 + Math.abs(state.speed) / 70, .55, 1.4),
      clamp(Math.abs(state.speed) / 200, .82, 1.4), state.run);
    // A released long jump still finishes promptly instead of hanging in the
    // air as measured travel speed falls to zero.
    const cadence = state.landing ? Math.max(1.05, travelCadence) : travelCadence;
    const previousGait = state.gait;
    state.gait = (state.gait + dt * TAU * cadence * state.walk) % TAU;
    if (state.landing && state.gait < previousGait) state.landing = false;
    if (state.rebuild === null) state.orbit = (state.orbit + dt * (.58 + state.excitement * .7)) % TAU;
    state.swim = (state.swim + dt * (6.5 + state.walk * 6 + state.excitement * 10)) % TAU;
    state.dart = (state.dart + dt * (2 + state.excitement * 3.5)) % TAU;
  }
  const moving = Math.abs(velocity) > 2;
  advanceFeet(state, dt, moving || state.landing, reduced, paused);
  if (!paused && !reduced) {
    if (moving || state.walk > .025 || state.settling || state.rebuild !== null) state.idleTime = 0;
    else state.idleTime += dt;
  }
  const targetIdle = reduced ? idlePose(0) : idlePose(state.idleTime);
  if (reduced) state.idle = targetIdle;
  else if (!paused) {
    for (const key of ['graze', 'neck', 'head', 'yaw', 'ear', 'chew', 'eye']) {
      state.idle[key] = approach(state.idle[key], targetIdle[key], dt, moving || state.walk > .025 ? .2 : .06);
    }
  }
  const idle = state.idle;
  const graze = idle.graze;
  const depth = Math.sin(state.orbit);
  const orbitFacing = clamp(-depth * 3.5, -1, 1);
  const travel = state.walk;
  const run = state.run;
  const excitement = state.excitement;
  const gallop = gallopBodyPose(state.gait);
  let bob = reduced ? 0 : blend(1.8 + Math.cos(state.gait * 2) * .45, gallop.bob, run) * state.walk + graze * 3 + (1 + Math.sin(state.elapsed * 1.6)) * .09 * (1 - state.walk);
  const tilt = graze * 1.1 + gallop.tilt * run * state.walk;
  // While a long stride finishes planting, keep the torso low enough for the
  // remaining contact feet to reach the road without locking the knees.
  if (!reduced && (travel > .025 || state.settling)) {
    for (let pass = 0; pass < 3; pass++) {
      let drop = 0;
      deerRig.forEach((leg, index) => {
        const angles = legPose(leg, state.gait, travel, bob, tilt, graze, state.feet[index], run);
        const reach = Math.hypot(angles.localFoot[0] - angles.stifle[0], angles.localFoot[1] - angles.stifle[1]);
        drop = Math.max(drop, reach - leg.upper - leg.lower + .12);
      });
      if (drop <= 0) break;
      bob += drop * 1.08;
    }
  }
  return {
    x: state.position,
    lag: target - state.position,
    speed: state.speed,
    reveal: state.rebuild === null ? 1 : clamp(state.rebuild / 2.6, 0, 1),
    rebuildCount: state.rebuildCount,
    mode: state.rebuild !== null ? 'rebuilding' : state.walk > .025 ? run > .42 ? 'running' : 'walking' : 'standing',
    walk: state.walk,
    run,
    air: reduced ? 0 : gallop.air * run * travel,
    excitement,
    feet: state.feet.map(foot => [...foot]),
    facing: state.facing,
    bob,
    tilt,
    coil: gallop.coil * run * travel,
    reach: gallop.reach * run * travel,
    neckSpring: gallop.neckSpring * run * travel,
    idleAction: reduced ? 'resting' : moving && idle.graze > .03 ? 'raising' : targetIdle.action,
    graze,
    neck: idle.neck + run * travel * (15 + gallop.air * 9 + gallop.neckSpring * .5),
    head: idle.head - state.walk * 1.2 - run * travel * (10 + gallop.air * 3 + gallop.tilt * .55 + gallop.neckSpring * .75),
    yaw: idle.yaw,
    ear: idle.ear - run * 3,
    chew: idle.chew,
    eye: idle.eye,
    fishX: blend(Math.cos(state.orbit) * 66, state.direction * (76 + excitement * (10 + Math.sin(state.dart) * 12)), travel),
    fishY: blend(-68 + depth * 18, -70 - excitement * 5 + Math.sin(state.dart) * (4 + excitement * 9), travel),
    fishFacing: blend(orbitFacing, state.direction, travel),
    fishDepth: blend(depth, .6 + Math.cos(state.dart) * excitement * .18, travel),
    fishScale: blend(.88 + depth * .1, 1, travel),
    fishTilt: blend(Math.cos(state.orbit) * 12, Math.cos(state.dart) * (4 + excitement * 7), travel),
    fishBend: reduced ? 0 : Math.sin(state.swim - .5) * excitement * 3.5,
    tail: reduced ? 0 : Math.sin(state.swim) * (12 + travel * 9 + excitement * 12),
    fin: reduced ? 0 : Math.sin(state.swim + 1.2) * (13 + excitement * 8)
  };
}

// Two-bone inverse kinematics keeps planted hooves on the luminous road.
export function solveLeg(hip, foot, upper, lower, bend = 1) {
  const dx = foot[0] - hip[0], dy = foot[1] - hip[1];
  const distance = clamp(Math.hypot(dx, dy), Math.abs(upper - lower) + .001, upper + lower - .001);
  const direction = -Math.atan2(dx, dy);
  const shoulder = Math.acos(clamp((upper * upper + distance * distance - lower * lower) / (2 * upper * distance), -1, 1));
  const knee = Math.acos(clamp((distance * distance - upper * upper - lower * lower) / (2 * upper * lower), -1, 1));
  return { upper: (direction + bend * shoulder) * 180 / Math.PI, lower: -bend * knee * 180 / Math.PI };
}

export function footPosition(leg, gait, walk) {
  // Positive phase means a later footfall: LH, LF, RH, RF.
  const cycle = ((gait / TAU - leg.phase) % 1 + 1) % 1;
  let stride, lift = 0;
  if (cycle < .7) stride = 1 - cycle / .7 * 2;
  else {
    const swing = (cycle - .7) / .3;
    const ease = swing * swing * (3 - 2 * swing);
    stride = -1 + 2 * ease;
    lift = Math.sin(swing * Math.PI) ** 1.4 * (leg.name.startsWith('front') ? 11 : 9);
  }
  return [leg.foot[0] + stride * 17 * walk, leg.foot[1] - lift * walk];
}

// Stylized same-side bounds requested by the user: fore/hind on each side
// share the stride phase, then both pairs collect during the main suspension.
const GALLOP_FALL = { 'hind-near': 0, 'front-near': 0, 'hind-far': .20, 'front-far': .20 };
const GALLOP_SUPPORT = .24;
const GALLOP_LIFTOFF = .20 + GALLOP_SUPPORT;
export function gallopBodyPose(gait) {
  const phase = ((gait / TAU) % 1 + 1) % 1;
  const flight = clamp((phase - GALLOP_LIFTOFF) / (1 - GALLOP_LIFTOFF), 0, 1);
  const air = Math.sin(flight * Math.PI) ** 1.8;
  const tilt = 1.5 + Math.sin(gait - .5) * 2 - Math.sin(flight * TAU) * Math.sin(flight * Math.PI) * 7;
  // The back gathers with the tucked feet, then opens on descent. Neck recoil
  // lags the landing compression; all channels use the same continuous phase.
  const compression = Math.exp(-(((phase - .12) / .13) ** 2)) + Math.exp(-(((phase - 1.12) / .13) ** 2));
  const coil = clamp(air * .50 + compression * .45, 0, 1);
  const reach = clamp((1 - coil) * (.5 + .5 * Math.sin(gait - 1.2)) + air * .6, 0, 1);
  const neckSpring = Math.sin(gait - .9) * 5 + Math.sin(flight * TAU) * Math.sin(flight * Math.PI) * 3;
  return { phase, air, coil, reach, neckSpring, bob: 12 + Math.sin(gait - 1.2) * 1.5 - air * 64, tilt };
}

export function gallopFootPosition(leg, gait, amount = 1, strideScale = 1) {
  const cycle = ((gait / TAU - GALLOP_FALL[leg.name]) % 1 + 1) % 1;
  const duty = GALLOP_SUPPORT;
  let stride, lift = 0;
  if (cycle < duty) stride = 1 - cycle / duty * 2;
  else {
    const swing = (cycle - duty) / (1 - duty);
    stride = -1 + 2 * smooth(swing);
    lift = Math.sin(swing * Math.PI) ** 1.1 * (leg.name.startsWith('front') ? 30 : 28);
  }
  const body = gallopBodyPose(gait);
  // Keep this descent reach shared by the whole side pair. A foreleg-only
  // override would break the requested fore/hind coordination in mid-air.
  const reach = body.phase > .76 ? smooth((body.phase - .76) / .23) : 1 - smooth(body.phase / .20);
  stride = blend(stride, 1, reach);
  lift *= 1 - reach * .7;
  lift += body.air * 48;
  // Retain each side's shared contact/swing rhythm, but open the silhouette
  // in flight: forefeet reach forward while hindfeet trail behind the hips.
  const spread = body.air * (leg.name.startsWith('front') ? 22 : -18);
  return [leg.foot[0] + (stride * 36 * strideScale + spread) * amount, leg.foot[1] - lift * amount];
}

export function legPose(leg, gait, walk, bob = 0, tilt = 0, graze = 0, placedFoot = null, run = 0) {
  const foot = placedFoot ? [...placedFoot] : footPosition(leg, gait, walk);
  foot[0] += graze * (leg.name === 'front-near' ? 10 : leg.name === 'front-far' ? -4 : -2);
  const angle = -tilt * Math.PI / 180;
  const dx = foot[0] - 100, dy = foot[1] - bob - 160;
  const localFoot = [100 + dx * Math.cos(angle) - dy * Math.sin(angle), 160 + dx * Math.sin(angle) + dy * Math.cos(angle)];
  const thigh = (leg.thighAngle || 0) - (leg.thigh ? clamp((foot[0] - leg.foot[0]) * blend(.65, 1.05, run), -blend(12, 25, run), blend(12, 25, run)) : 0);
  const radians = thigh * Math.PI / 180;
  const stifle = leg.thigh ? [leg.hip[0] - Math.sin(radians) * leg.thigh, leg.hip[1] + Math.cos(radians) * leg.thigh] : leg.hip;
  const angles = solveLeg(stifle, localFoot, leg.upper, leg.lower, leg.bend);
  const toe = run * 10 * clamp((leg.foot[1] - foot[1]) / 70, 0, 1);
  return { thigh, upper: angles.upper - thigh, lower: angles.lower, hoof: -angles.upper - angles.lower + toe, foot, stifle, localFoot };
}

export function createCompanions(root, reducedMotion) {
  const deer = root.querySelector('.deer-facing');
  const fish = root.querySelector('.fish-facing');
  deer.innerHTML = deerArtwork;
  fish.innerHTML = fishArtwork;
  // Separate code ribbons orbit the projection while the skinned shader draws
  // the animals from sparse digits and Fresnel contours into a full surface.
  for (const [name, holder] of [['deer', deer], ['fish', fish]]) {
    const ribbons = document.createElement('div'); ribbons.className = 'holo-rebuild';
    ribbons.innerHTML = [0, 1, 2].map(index => `<span class="code-orbit" style="--orbit:${index}"><svg viewBox="0 0 160 160"><defs><path id="rebuild-${name}-${index}" d="M14 80a66 66 0 1 1 132 0a66 66 0 1 1-132 0"/></defs><text><textPath href="#rebuild-${name}-${index}">01 110 001 10 101 00 110 01 010 11 100 01 101 00 10</textPath></text></svg></span>`).join('');
    holder.parentElement.append(ribbons);
  }
  const body = deer.querySelector('[data-deer-body]');
  const neck = deer.querySelector('[data-deer-neck]');
  const head = deer.querySelector('[data-deer-head]');
  const ears = [...deer.querySelectorAll('[data-deer-ear]')];
  const muzzle = deer.querySelector('[data-deer-muzzle]');
  const eye = deer.querySelector('[data-deer-eye]');
  const tail = fish.querySelector('[data-fish-tail]');
  const fin = fish.querySelector('[data-fish-fin]');
  const fishPosition = root.querySelector('.fish');
  const shadow = root.querySelector('.deer-shadow');
  const joints = deerRig.map(leg => ({ ...leg,
    thighNode: deer.querySelector(`[data-thigh="${leg.name}"]`),
    upperNode: deer.querySelector(`[data-upper="${leg.name}"]`),
    lowerNode: deer.querySelector(`[data-lower="${leg.name}"]`),
    hoofNode: deer.querySelector(`[data-hoof="${leg.name}"]`)
  }));
  const state = createMotionState();
  let reset = true;
  let holograms = null;
  import('./assets/companions-3d.bundle.js')
    .then(module => module.createHologramCompanions(root))
    .then(renderer => { holograms = renderer; })
    .catch(error => { root.dataset.renderer = 'svg'; console.warn('Companion 3D fallback:', error); });
  function pivot(node, angle, fallback) {
    if (!node) return;
    const origin = node.getAttribute('data-pivot') || fallback;
    node.setAttribute('transform', `rotate(${angle.toFixed(3)} ${origin})`);
  }
  return {
    reset() { reset = true; state.followSpeed = state.speed = state.walk = state.run = state.fastTime = state.fastSamples = state.excitement = 0; state.runRequested = state.landing = false; state.feet = deerRig.map(leg => [...leg.foot]); state.settling = null; state.stepped = false; state.silence = 1; },
    update(view) {
      const pose = advanceMotion(state, { ...view, reduced: reducedMotion.matches, reset });
      reset = false;
      root.style.transform = `translate3d(${pose.x.toFixed(3)}px,0,0)`;
      root.dataset.motion = pose.mode;
      root.dataset.reveal = pose.reveal.toFixed(3);
      root.dataset.rebuildCount = String(pose.rebuildCount);
      root.style.setProperty('--rebuild-opacity', String(smooth(pose.reveal / .10) * (1 - smooth((pose.reveal - .72) / .28))));
      root.style.setProperty('--scan-turn', `${state.elapsed * 105}deg`);
      root.dataset.run = pose.run.toFixed(3);
      root.dataset.lag = pose.lag.toFixed(1);
      root.dataset.speed = pose.speed.toFixed(1);
      root.dataset.excitement = pose.excitement.toFixed(3);
      root.dataset.idle = pose.idleAction;
      deer.style.transform = holograms ? '' : `scaleX(${pose.facing.toFixed(3)})`;
      for (const holder of [deer, fish]) {
        holder.style.clipPath = holograms || pose.reveal === 1 ? '' : `inset(${(1 - pose.reveal) * 100}% 0 0)`;
        holder.style.opacity = holograms ? '1' : String(smooth(pose.reveal));
      }
      body.setAttribute('transform', `translate(0 ${pose.bob.toFixed(3)}) rotate(${pose.tilt.toFixed(3)} 100 160)`);
      const posedLegs = [];
      for (let index = 0; index < joints.length; index++) {
        const leg = joints[index];
        const angles = legPose(leg, state.gait, pose.walk, pose.bob, pose.tilt, pose.graze, pose.feet[index], pose.run);
        posedLegs.push({ name: leg.name, angles });
        if (leg.thighNode) leg.thighNode.setAttribute('transform', `rotate(${angles.thigh.toFixed(3)})`);
        leg.upperNode.setAttribute('transform', `rotate(${angles.upper.toFixed(3)})`);
        leg.lowerNode.setAttribute('transform', `translate(0 ${leg.upper}) rotate(${angles.lower.toFixed(3)})`);
        if (leg.hoofNode) leg.hoofNode.setAttribute('transform', `rotate(${(angles.hoof - pose.tilt).toFixed(3)} 0 ${leg.lower})`);
      }
      pivot(neck, pose.neck, '133 170');
      if (head) {
        const [hx, hy] = (head.getAttribute('data-pivot') || '158 108').split(' ').map(Number);
        head.setAttribute('transform', `rotate(${pose.head.toFixed(3)} ${hx} ${hy}) translate(${hx} ${hy}) scale(${pose.yaw.toFixed(3)} 1) translate(${-hx} ${-hy})`);
      }
      ears.forEach((ear, index) => pivot(ear, pose.ear * (index ? 1 : -.7), '160 89'));
      pivot(muzzle, pose.chew, '194 110');
      if (eye) eye.setAttribute('transform', `translate(${pose.eye.toFixed(3)} 0)`);
      fishPosition.style.transform = `translate3d(${pose.fishX.toFixed(3)}px,${pose.fishY.toFixed(3)}px,0) rotate(${pose.fishTilt.toFixed(3)}deg) scale(${pose.fishScale.toFixed(3)})`;
      fishPosition.style.zIndex = pose.fishDepth > 0 ? '4' : '2';
      fishPosition.style.opacity = String(.78 + Math.max(0, pose.fishDepth) * .22);
      fish.style.transform = holograms ? '' : `scaleX(${pose.fishFacing.toFixed(3)})`;
      pivot(tail, pose.tail, '60 50');
      pivot(fin, pose.fin, '135 60');
      shadow.style.transform = `scaleX(${(1 - pose.air * .42 - clamp(pose.bob, 0, 16) * .008).toFixed(3)})`;
      shadow.style.opacity = String((.85 - pose.air * .5) * smooth(pose.reveal));
      holograms?.update(pose, posedLegs, state.elapsed, reducedMotion.matches);
    }
  };
}
