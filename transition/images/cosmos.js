// Local reference photograph, a distant star field, and independent foreground planes.
// Shares the page clock; no additional WebGL context or animation loop is needed.
export function createCosmos(canvas, reducedMotion) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { draw() {} };
  const width = 270, height = 920;
  canvas.width = width; canvas.height = height;
  const volume = document.querySelector('.portal-volume');
  let targetX = 0, targetY = 0, pointerX = 0, pointerY = 0;
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    targetX = Math.max(-1, Math.min(1, event.clientX / innerWidth * 2 - 1));
    targetY = Math.max(-1, Math.min(1, event.clientY / innerHeight * 2 - 1));
  }, { passive: true });
  document.addEventListener('pointerleave', () => { targetX = targetY = 0; });
  window.addEventListener('blur', () => { targetX = targetY = 0; });
  const nebula = new Image();
  let nebulaReady = false;
  nebula.onload = () => { nebulaReady = true; previous = -100; };
  nebula.src = new URL('assets/heart-soul-portrait.jpg', import.meta.url).href;
  let seed = 48621;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const background = document.createElement('canvas');
  background.width = width; background.height = height;
  const paint = background.getContext('2d');
  paint.fillStyle = '#060b18'; paint.fillRect(0, 0, width, height);
  for (let i = 0; i < 95; i++) {
    const y = random() * height;
    const x = 170 + Math.sin(y / 200) * 90 + (random() - .5) * 200;
    const radius = 45 + random() * 160;
    const gradient = paint.createRadialGradient(x, y, 0, x, y, radius);
    const color = ['107, 116, 158', '118, 106, 147', '87, 125, 152', '177, 159, 163'][i % 4];
    gradient.addColorStop(0, `rgba(${color},.055)`); gradient.addColorStop(1, `rgba(${color},0)`);
    paint.fillStyle = gradient; paint.fillRect(0, 0, width, height);
  }
  const stars = Array.from({ length: 570 }, () => ({ x: random() * width, y: random() * height, r: .2 + random() ** 5 * 2, a: .15 + random() * .7, phase: random() * 6.28 }));
  for (let i = 0; i < 950; i++) {
    const y = random() * height;
    const x = 165 + Math.sin(y / 200) * 90 + (random() + random() - 1) * 70;
    paint.fillStyle = `rgba(207,214,238,${random() * .38})`;
    paint.fillRect(x, y, .4 + random(), .4 + random());
  }
  let previous = -100;
  return { draw(time = 0) {
    const still = reducedMotion.matches;
    pointerX += ((still ? 0 : targetX) - pointerX) * .065;
    pointerY += ((still ? 0 : targetY) - pointerY) * .065;
    if (volume) {
      volume.style.setProperty('--nebula-x', `${still ? 0 : pointerX * 13}px`);
      volume.style.setProperty('--nebula-y', `${still ? 0 : pointerY * 10}px`);
      volume.style.setProperty('--nebula-drift', `${still ? 0 : Math.sin(time * .00023) * 5}px`);
      volume.style.setProperty('--nebula-rotate', `${still ? 0 : pointerX * 4}deg`);
    }
    if (time - previous < 80 || (reducedMotion.matches && previous >= 0)) return;
    previous = time;
    ctx.drawImage(background, 0, 0);
    if (nebulaReady) {
      // The bottom caption belongs to the reference photograph, outside the scene crop.
      const sourceHeight = nebula.naturalHeight * .935;
      const imageWidth = height * nebula.naturalWidth / sourceHeight;
      ctx.globalAlpha = .82;
      ctx.drawImage(nebula, 0, 0, nebula.naturalWidth, sourceHeight,
        (width - imageWidth) / 2 - pointerX * 8, -8 - pointerY * 5, imageWidth, height + 20);
      ctx.globalAlpha = 1;
    }
    for (const star of stars) {
      const alpha = star.a * (reducedMotion.matches ? .8 : .72 + Math.sin(time * .0006 + star.phase) * .24);
      ctx.fillStyle = `rgba(232,235,248,${alpha})`;
      ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill();
      if (star.r > 1.7) {
        ctx.strokeStyle = `rgba(230,234,251,${alpha * .35})`; ctx.lineWidth = .6;
        ctx.beginPath(); ctx.moveTo(star.x - 5, star.y); ctx.lineTo(star.x + 5, star.y); ctx.moveTo(star.x, star.y - 5); ctx.lineTo(star.x, star.y + 5); ctx.stroke();
      }
    }
    const glow = ctx.createRadialGradient(85, 850, 0, 85, 850, 185);
    glow.addColorStop(0, '#C5D95144'); glow.addColorStop(.28, '#C5D95118'); glow.addColorStop(1, '#C5D95100');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
  } };
}
