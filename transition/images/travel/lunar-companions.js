import { companionRevealDuration, createCompanions } from '../companions.js';

const stops = [
  { position: .3, rest: 2 },
  { position: .86, rest: 18 },
  { position: .54, rest: 7 },
  { position: .1, rest: 16 }
];

export function createLunarCompanions(outline, reducedMotion, loadRenderer) {
  const frame = outline.querySelector('.lunar-door-frame');
  const stage = outline.querySelector('.lunar-companion-stage');
  const animals = createCompanions(stage.querySelector('.companions'), reducedMotion, loadRenderer);
  let scale = 1;
  let width = 0;
  let start = 0;
  let span = 0;
  let position = stops[0].position;
  let rest = stops[0].rest;
  let next = 1;
  let reveal = 0;

  function resize() {
    width = outline.clientWidth;
    scale = .85 * Math.max(.38, Math.min(.94, frame.offsetHeight / 215));
    const clearance = Math.min(100 * scale, (width - frame.offsetWidth) / 3);
    start = frame.offsetWidth + clearance;
    span = Math.max(0, width - clearance - start);
    stage.style.setProperty('--lunar-companion-scale', scale);
    animals.reset();
  }

  function update(dt) {
    if (reducedMotion.matches) reveal = 1;
    else if (reveal === 1 && span > 0) {
      if (rest > 0) rest -= dt;
      else {
        const stop = stops[next];
        const distance = stop.position - position;
        const step = 43 * scale * dt / span;
        if (Math.abs(distance) <= step) {
          position = stop.position;
          rest = stop.rest;
          next = (next + 1) % stops.length;
        } else position += Math.sign(distance) * step;
      }
    }
    animals.update({ camera: 0, scale, width, dt, targetX: (start + span * position) / scale }, reveal);
    if (stage.hidden) stage.hidden = false;
    reveal = Math.min(1, reveal + dt / companionRevealDuration);
  }

  return { ready: animals.ready, resize, update, dispose: animals.dispose };
}
