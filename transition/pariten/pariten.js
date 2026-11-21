const popup = document.querySelector('.name-popup');
const closeButton = popup.querySelector('.close');
const zones = [...document.querySelectorAll('.dropzone')];
let popupCard = null;
let drag = null;

// Only move a row's photos away from the boundary if they reach its right-hand stack.
function sizeBoundaries() {
  if (drag?.ghost) return;
  for (const boundary of document.querySelectorAll('.boundary')) {
    const zone = boundary.querySelector('.dropzone');
    const leftEdge = Math.min(...Array.from(zone.children, card => card.getBoundingClientRect().left));
    const depth = zone.childElementCount ? zone.getBoundingClientRect().height / 2 : 0;
    const neighbors = [
      [boundary.previousElementSibling, '--lower-depth', 'paddingBottom'],
      [boundary.nextElementSibling, '--upper-depth', 'paddingTop']
    ];
    for (const [tier, depthProperty, padding] of neighbors) {
      const row = tier.querySelector('.dropzone');
      const reachesStack = [...row.children].some(card => card.getBoundingClientRect().right + 8 > leftEdge);
      row.style.setProperty(depthProperty, depth + 'px');
      row.style[padding] = reachesStack ? (depth + 12) + 'px' : '';
    }
  }
}
const observer = new ResizeObserver(sizeBoundaries);
document.querySelectorAll('.boundary .dropzone').forEach(zone => observer.observe(zone));
sizeBoundaries();

function closePopup(restoreFocus = false) {
  popup.hidden = true;
  if (restoreFocus) popupCard?.focus({ preventScroll: true });
  popupCard = null;
}

function showPopup(card, x, y) {
  finishDrag(true);
  popupCard = card;
  popup.querySelector('p').textContent = card.getAttribute('aria-label');
  popup.hidden = false;
  popup.style.left = Math.max(12, Math.min(x + 8, innerWidth - popup.offsetWidth - 12)) + 'px';
  popup.style.top = Math.max(12, Math.min(y + 8, innerHeight - popup.offsetHeight - 12)) + 'px';
  closeButton.focus({ preventScroll: true });
}

document.addEventListener('contextmenu', event => {
  const card = event.target.closest('.card');
  if (!card) return;
  event.preventDefault();
  const box = card.getBoundingClientRect();
  showPopup(card, event.clientX || box.left, event.clientY || box.top);
});
closeButton.addEventListener('click', () => closePopup(true));
window.addEventListener('resize', () => closePopup());

function moveDrag(x, y) {
  drag.ghost.style.left = (x - drag.offsetX) + 'px';
  drag.ghost.style.top = (y - drag.offsetY) + 'px';
  const target = document.elementFromPoint(x, y);
  const zone = target?.closest('.dropzone') || target?.closest('.tier')?.querySelector('.dropzone');
  if (zone !== drag.zone) {
    drag.zone?.classList.remove('over');
    zone?.classList.add('over');
    drag.zone = zone;
  }
  if (!zone) return;
  const before = [...zone.querySelectorAll('.card')].find(card => {
    if (card === drag.card) return false;
    const box = card.getBoundingClientRect();
    return y < box.top || (y <= box.bottom && x < box.left + box.width / 2);
  });
  zone.insertBefore(drag.placeholder, before || null);
}

function scrollNearEdge() {
  const { x, y } = drag;
  let delta = 0;
  if (y < 64) delta = -Math.ceil((64 - y) / 5);
  else if (y > innerHeight - 64) delta = Math.ceil((y - innerHeight + 64) / 5);
  if (delta) {
    window.scrollBy(0, delta);
    moveDrag(x, y);
  }
  drag.frame = requestAnimationFrame(scrollNearEdge);
}

function beginDrag() {
  const box = drag.card.getBoundingClientRect();
  drag.offsetX = drag.startX - box.left;
  drag.offsetY = drag.startY - box.top;
  drag.ghost = drag.card.cloneNode(true);
  drag.ghost.classList.add('ghost');
  drag.ghost.tabIndex = -1;
  drag.ghost.setAttribute('aria-hidden', 'true');
  drag.placeholder = document.createElement('div');
  drag.placeholder.className = 'placeholder';
  for (const el of [drag.placeholder, drag.ghost]) {
    el.style.width = box.width + 'px';
    el.style.height = box.height + 'px';
  }
  drag.card.before(drag.placeholder);
  drag.card.hidden = true;
  document.body.append(drag.ghost);
  document.body.classList.add('dragging');
  drag.frame = requestAnimationFrame(scrollNearEdge);
}

function finishDrag(cancel = false) {
  if (!drag) return;
  if (drag.ghost) {
    cancelAnimationFrame(drag.frame);
    if (!cancel && drag.zone) drag.placeholder.replaceWith(drag.card);
    else drag.placeholder.remove();
    drag.card.hidden = false;
    drag.ghost.remove();
    drag.zone?.classList.remove('over');
    document.body.classList.remove('dragging');
  }
  drag = null;
  sizeBoundaries();
}

document.addEventListener('pointerdown', event => {
  if (!popup.hidden && !popup.contains(event.target)) closePopup();
  const card = event.target.closest('.card');
  if (!card || event.button !== 0 || drag) return;
  drag = { card, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
});
document.addEventListener('pointermove', event => {
  if (drag?.pointerId !== event.pointerId) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (!drag.ghost && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 5) beginDrag();
  if (drag.ghost) {
    event.preventDefault();
    moveDrag(drag.x, drag.y);
  }
}, { passive: false });
document.addEventListener('pointerup', event => {
  if (drag?.pointerId !== event.pointerId) return;
  if (drag.ghost) moveDrag(event.clientX, event.clientY);
  finishDrag();
});
document.addEventListener('pointercancel', event => {
  if (drag?.pointerId === event.pointerId) finishDrag(true);
});
window.addEventListener('blur', () => finishDrag(true));

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!popup.hidden) closePopup(true);
    finishDrag(true);
    return;
  }
  const card = event.target.closest('.card');
  if (!card || drag) return;
  const index = zones.indexOf(card.parentElement);
  switch (event.key) {
    case 'ContextMenu':
    case 'F10': {
      if (event.key === 'F10' && !event.shiftKey) return;
      event.preventDefault();
      const box = card.getBoundingClientRect();
      showPopup(card, box.left, box.top);
      return;
    }
    case 'ArrowUp': zones[Math.max(0, index - 1)].append(card); break;
    case 'ArrowDown': zones[Math.min(zones.length - 1, index + 1)].append(card); break;
    case 'ArrowLeft': card.previousElementSibling?.before(card); break;
    case 'ArrowRight': card.nextElementSibling?.after(card); break;
    default: return;
  }
  event.preventDefault();
  sizeBoundaries();
  card.focus();
});
