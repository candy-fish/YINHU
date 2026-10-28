// A separate sky keeps distant stars crisp while the aurora's soft light moves
// across them. The gallery clock owns both; no extra animation loop is created.
export function createNightStars(canvas, reducedMotion) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return { draw() {} };
  const nebula = document.createElement('canvas');
  let width = 0, height = 0, stars = [], previous = -Infinity, dirty = true;
  function resize() {
    const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    let seed = 418763;
    const random = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
    // Concentrate the sky in its upper-third canvas, at a slightly greater
    // surface density. The bottom mask dissolves it before the gallery below.
    const count = Math.max(100, Math.min(500, Math.round(width * height / 1050)));
    stars = Array.from({ length: count }, (_, index) => {
      const size = random();
      return { x: random() * width, y: Math.pow(random(), index % 4 ? 1.18 : 1) * height,
        r: .32 + Math.pow(size, 5) * 1.05, alpha: .19 + random() * .49,
        phase: random() * Math.PI * 2, rate: .00025 + random() * .00045,
        color: ['200,237,239', '233,237,243', '187,215,229', '235,206,229'][index % 4] };
    });
    // Cache a restrained band of overlapping blue/pink cloud knots. These stay
    // behind the stars and aurora, with no extra frame loop or image downloads.
    nebula.width = Math.max(1, Math.ceil(width * .4)); nebula.height = Math.max(1, Math.ceil(height * .4));
    const cloud = nebula.getContext('2d'); cloud.setTransform(.4, 0, 0, .4, 0, 0);
    for (let i = 0; i < 30; i++) {
      const u = i / 29;
      const x = u * width + (random() - .5) * width * .06;
      const y = height * (.41 + Math.sin(u * 7.5 - .6) * .14 + (random() - .5) * .24);
      const rx = width * (.035 + random() * .065), ry = height * (.12 + random() * .25);
      const color = ['187,215,229', '119,113,143', '235,206,229', '187,221,197'][i % 4];
      cloud.save(); cloud.translate(x, y); cloud.scale(rx, ry);
      const mist = cloud.createRadialGradient(0, 0, 0, 0, 0, 1);
      mist.addColorStop(0, `rgba(${color},${.025 + random() * .025})`);
      mist.addColorStop(.48, `rgba(${color},.012)`); mist.addColorStop(1, `rgba(${color},0)`);
      cloud.fillStyle = mist; cloud.fillRect(-1, -1, 2, 2); cloud.restore();
    }
    canvas.dataset.stars = String(count); dirty = true;
  }
  window.addEventListener('resize', resize, { passive: true });
  reducedMotion.addEventListener('change', () => { dirty = true; });
  resize();
  return { draw(time = 0) {
    if (!dirty && (reducedMotion.matches || time - previous < 100)) return;
    previous = time; dirty = false; ctx.clearRect(0, 0, width, height);
    ctx.drawImage(nebula, 0, 0, width, height);
    for (const star of stars) {
      const twinkle = reducedMotion.matches ? .85 : .82 + Math.sin(time * star.rate + star.phase) * .18;
      const fade = 1 - .6 * Math.pow(star.y / Math.max(1, height), 1.5);
      const alpha = star.alpha * twinkle * fade;
      ctx.fillStyle = `rgba(${star.color},${alpha})`;
      ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill();
      if (star.r > 1.12) {
        const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, 6);
        glow.addColorStop(0, `rgba(${star.color},${alpha * .25})`); glow.addColorStop(1, `rgba(${star.color},0)`);
        ctx.fillStyle = glow; ctx.fillRect(star.x - 6, star.y - 6, 12, 12);
        ctx.strokeStyle = `rgba(${star.color},${alpha * .25})`; ctx.lineWidth = .5;
        ctx.beginPath(); ctx.moveTo(star.x - 3, star.y); ctx.lineTo(star.x + 3, star.y);
        ctx.moveTo(star.x, star.y - 3); ctx.lineTo(star.x, star.y + 3); ctx.stroke();
      }
    }
  } };
}
