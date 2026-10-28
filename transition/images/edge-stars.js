// Small, independent stars live only in the viewport's diffuse light rim.
// CSS owns their slow twinkle, including while the gallery is paused in a dialog.
export function createEdgeStars() {
  const fields = [...document.querySelectorAll('.screen-stars')];
  if (!fields.length || fields.every(field => field.dataset.ready)) return;
  fields.forEach(field => { field.dataset.ready = 'true'; });
  function resize() {
    const width = innerWidth, height = innerHeight;
    const band = Math.min(64, width * .12, height * .12);
    const perimeter = (width + height) * 2;
    const count = Math.max(60, Math.min(170, Math.round(perimeter / 34)));
    let seed = 826104;
    const random = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const star = document.createElement('i');
      const along = random() * perimeter;
      const inset = 5 + Math.pow(random(), 1.5) * (band - 5);
      let x, y;
      if (along < width) { x = along; y = inset; }
      else if (along < width + height) { x = width - inset; y = along - width; }
      else if (along < width * 2 + height) { x = width * 2 + height - along; y = height - inset; }
      else { x = inset; y = perimeter - along; }
      const bright = i % 13 === 0;
      star.className = `edge-star${bright ? ' edge-star-bright' : ''}`;
      star.style.cssText = `left:${x / width * 100}%;top:${y / height * 100}%;width:${bright ? 1.7 : .65 + random() * .7}px;--star-color:${['#C8EDEF', '#EBCEE5', '#BBDDC5', '#E9EDF3'][i % 4]};--star-alpha:${.35 + random() * .4};--star-duration:${4 + random() * 5}s;--star-delay:${-random() * 9}s`;
      fragment.append(star);
    }
    for (const field of fields) {
      field.replaceChildren(fragment.cloneNode(true));
      field.dataset.stars = String(count);
    }
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });
}
