import { listWindows, saveWindow, deleteWindow, imageURL, MAX_COVER_BYTES, COVER_TYPES, FRAME_LIMITS, parseWindowTime, formatWindowTime } from './image-store.js';
import { createCosmos } from './cosmos.js';
import { createAurora } from './aurora.js';
import { getWindowFrame, layoutWindows, rectangleFromPoints } from './window-layout.js';
import { createCompanions } from './companions.js';
import { createEdgeStars } from './edge-stars.js';

createEdgeStars();

const $ = id => document.getElementById(id);
const scene = $('scene'), world = $('sceneWorld'), windows = $('windows');
const editor = $('editor'), detail = $('windowDetail'), form = $('windowForm');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const cosmos = createCosmos($('cosmos'), reducedMotion);
const aurora = createAurora($('aurora'), reducedMotion);
const companions = createCompanions($('companions'), reducedMotion);

let records = [], displayed = [], layouts = [], objectURLs = [];
let camera = 0, targetCamera = 0, maxCamera = 0, scale = 1, verticalOffset = 0, worldWidth = 2450;
let hoverVelocity = 0, lastTime = 0, toastTimer, editing = null, currentDetail = null;
let selectedCover = null, previewURL = null, detailURL = null, saving = false, coverDecoding = false;
let lastSavedID = null, touchStart = null, draggingProgress = false, frameID = null;
let loadSequence = 0, coverSequence = 0;
let drawing = false, drawingAnchor = null, drawingRectangle = null, drawingContext = null, draftFrame = null;
let drawingPointer = null, suppressDrawClick = false;
const drawSurface = $('drawSurface'), drawPreview = $('drawPreview');
const artworkInfo = $('artworkInfo');
let inspectedWindow = null;
let infoHideTimer;

function hideArtworkInfo() {
  clearTimeout(infoHideTimer);
  if (inspectedWindow) inspectedWindow.removeAttribute('aria-describedby');
  inspectedWindow = null; artworkInfo.hidden = true;
}
function scheduleInfoHide() {
  clearTimeout(infoHideTimer);
  infoHideTimer = setTimeout(() => { if (document.activeElement !== inspectedWindow) hideArtworkInfo(); }, 160);
}
artworkInfo.addEventListener('pointerenter', () => clearTimeout(infoHideTimer));
artworkInfo.addEventListener('pointerleave', scheduleInfoHide);
function positionArtworkInfo() {
  if (!inspectedWindow) return;
  const rect = inspectedWindow.getBoundingClientRect();
  const panel = artworkInfo.getBoundingClientRect();
  const left = Math.max(12, Math.min(rect.right + 18, innerWidth - panel.width - 12));
  const top = Math.max(12, Math.min(rect.top, innerHeight - panel.height - 12));
  Object.assign(artworkInfo.style, { left: `${left}px`, top: `${top}px` });
}
function showArtworkInfo(button, record, layout) {
  if (drawing || editor.open || detail.open) return;
  hideArtworkInfo(); stopHover(); inspectedWindow = button;
  $('artworkTitle').textContent = record.title;
  $('artworkTime').textContent = formatWindowTime(record);
  $('artworkMaterial').textContent = record.material || '—';
  $('artworkSize').textContent = `${Math.round(layout.width * 10) / 10} × ${Math.round(layout.height * 10) / 10} px`;
  button.setAttribute('aria-describedby', 'artworkInfo'); artworkInfo.hidden = false; positionArtworkInfo();
}

function notify(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3800);
}

function renderWindows(focusID) {
  hideArtworkInfo();
  objectURLs.forEach(url => URL.revokeObjectURL(url)); objectURLs = [];
  displayed = [...records].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const result = layoutWindows(displayed);
  layouts = result.layouts;
  const fragment = document.createDocumentFragment();
  displayed.forEach((record, index) => {
    const layout = layouts[index];
    const button = document.createElement('button'); button.type = 'button'; button.className = 'memory-window';
    button.dataset.id = record.id; button.setAttribute('aria-label', `${record.title}, ${formatWindowTime(record)}, View window`);
    Object.assign(button.style, { left: `${layout.x}px`, top: `${layout.y}px`, width: `${layout.width}px`, height: `${layout.height}px` });
    button.style.setProperty('--delay', `${Math.min(index * .055, .4)}s`);
    const picture = document.createElement('span'); picture.className = 'window-picture';
    const url = imageURL(record);
    if (url) {
      button.style.setProperty('--window-glow-image', `url("${url}")`);
      button.style.setProperty('--window-crop', record.crop || '50% 50%');
      objectURLs.push(url);
      const img = document.createElement('img'); img.src = url; img.alt = ''; img.draggable = false;
      picture.style.setProperty('--crop', record.crop || '50% 50%'); picture.append(img);
    } else {
      const blank = document.createElement('span'); blank.className = 'window-blank'; picture.append(blank);
    }
    const number = document.createElement('span'); number.className = 'window-number'; number.textContent = String(index + 1).padStart(2, '0');
    button.append(picture, number); fragment.append(button);
    button.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') showArtworkInfo(button, record, layout); });
    button.addEventListener('pointerleave', scheduleInfoHide);
    button.addEventListener('focus', () => showArtworkInfo(button, record, layout));
    button.addEventListener('blur', hideArtworkInfo);
    button.addEventListener('click', () => openDetail(record));
  });
  windows.replaceChildren(fragment);
  worldWidth = Math.max(1600, result.end + 220);
  world.style.width = `${worldWidth}px`;
  $('lightRoad').style.width = `${worldWidth - 200}px`;
  const dates = document.createDocumentFragment();
  let previousYear;
  displayed.forEach((record, index) => {
    const year = record.date.slice(0, 4);
    if (year === previousYear) return;
    previousYear = year;
    const marker = document.createElement('button'); marker.type = 'button'; marker.className = 'date-marker'; marker.style.left = `${layouts[index].x}px`;
    marker.textContent = year; marker.setAttribute('aria-label', `Explore ${year}`);
    marker.addEventListener('click', () => { stopHover(); moveTo(layouts[index].x * scale - scene.clientWidth * .3); }); dates.append(marker);
  });
  $('timelineDates').replaceChildren(dates); resize();
  if (focusID) {
    const layout = layouts.find(item => item.id === focusID);
    if (layout) moveTo((layout.x + layout.width / 2) * scale - scene.clientWidth / 2);
  }
}

async function refresh(focusID) {
  const sequence = ++loadSequence;
  try {
    const next = await listWindows(); if (sequence !== loadSequence) return;
    records = next; renderWindows(focusID);
  } catch (error) { notify(error.message); if (!displayed.length) renderWindows(); }
}

function resize() {
  hideArtworkInfo();
  if (editor.open) fitEditorFrame();
  scale = Math.max(.3, Math.min(1, (scene.clientHeight - 10) / 650));
  document.documentElement.style.setProperty('--panel-line-width', `${$('lightRoad').offsetHeight * scale}px`);
  world.style.setProperty('--scene-scale', scale);
  verticalOffset = Math.max(0, (scene.clientHeight - 640 * scale) / 2);
  maxCamera = Math.max(0, worldWidth * scale - scene.clientWidth + 36);
  targetCamera = Math.min(targetCamera, maxCamera); camera = Math.min(camera, maxCamera);
  const roadY = verticalOffset + 550 * scale;
  companions.reset();
  Object.assign($('timelineHover').style, { top: `${roadY - 17}px`, height: `${38 * scale}px` });
  updateCamera();
}
function updateCamera() {
  world.style.transform = `translate3d(${-camera}px,${verticalOffset}px,0) scale(${scale})`;
  positionArtworkInfo();
  const progress = maxCamera ? camera / maxCamera : 0;
  $('progressTrack').value = String(progress * 100);
  $('progressTrack').setAttribute('aria-valuetext', `${Math.round(progress * 100)}% · Newer to the right`);
  $('progressTrack').disabled = maxCamera <= 0;
}
function moveTo(position, immediate = false) {
  targetCamera = Math.max(0, Math.min(maxCamera, position));
  if (immediate || reducedMotion.matches) { camera = targetCamera; updateCamera(); }
}
scene.addEventListener('focusin', event => {
  const button = event.target.closest('button');
  if (!button || !world.contains(button)) return;
  const x = parseFloat(button.style.left) || button.offsetLeft;
  const left = x * scale - targetCamera, right = (x + button.offsetWidth) * scale - targetCamera;
  if (left < 36 || right > scene.clientWidth - 36) { stopHover(); moveTo((x + button.offsetWidth / 2) * scale - scene.clientWidth / 2); }
});
scene.addEventListener('scroll', () => { if (scene.scrollLeft) scene.scrollLeft = 0; if (scene.scrollTop) scene.scrollTop = 0; });
function stopHover() { hoverVelocity = 0; }
function hoverMove(event) {
  if (event.pointerType === 'touch' || inspectedWindow || drawing || editor.open || detail.open || touchStart || draggingProgress) return;
  const rect = scene.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
  const roadY = verticalOffset + 550 * scale;
  const onRoad = y >= roadY - 18 && y <= roadY + 25 * scale;
  const edge = Math.min(110, rect.width * .13);
  let velocity = 0;
  if (onRoad) {
    const relative = (x / rect.width - .5) * 2;
    if (Math.abs(relative) > .17) velocity = Math.sign(relative) * Math.pow((Math.abs(relative) - .17) / .83, 1.4) * 290;
  } else if (x < edge) velocity = -(1 - x / edge) * 280;
  else if (x > rect.width - edge) velocity = (1 - (rect.width - x) / edge) * 280;
  hoverVelocity = velocity;
}

function tick(time) {
  const dt = Math.min(.04, (time - lastTime) / 1000 || .016); lastTime = time;
  if (!editor.open && !detail.open) {
    if (hoverVelocity) moveTo(targetCamera + hoverVelocity * dt);
    if (Math.abs(camera - targetCamera) > .05) { camera += (targetCamera - camera) * (1 - Math.exp(-dt * 9)); updateCamera(); }
    cosmos.draw(time);
    aurora.draw(time);
  }
  companions.update({ camera, scale, width: scene.clientWidth, dt, paused: editor.open || detail.open,
    interacting: draggingProgress || Boolean(touchStart?.moved) });
  frameID = requestAnimationFrame(tick);
}
scene.addEventListener('pointermove', hoverMove); scene.addEventListener('pointerleave', stopHover);
scene.addEventListener('wheel', event => {
  if (drawingAnchor || editor.open || detail.open || event.ctrlKey) return;
  if (document.documentElement.scrollHeight > innerHeight && Math.abs(event.deltaY) > Math.abs(event.deltaX) && !event.shiftKey) return;
  event.preventDefault(); stopHover(); moveTo(targetCamera + (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? scene.clientWidth : 1));
}, { passive: false });
scene.addEventListener('keydown', event => {
  if (drawing || event.target.closest('button')) return;
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); stopHover();
    moveTo(event.key === 'Home' ? 0 : event.key === 'End' ? maxCamera : targetCamera + (event.key === 'ArrowLeft' ? -1 : 1) * scene.clientWidth * .48);
  }
});
scene.addEventListener('pointerdown', event => {
  if (drawing || event.pointerType !== 'touch') return;
  touchStart = { x: event.clientX, camera: targetCamera, moved: false }; stopHover();
});
scene.addEventListener('pointermove', event => {
  if (drawing || !touchStart || event.pointerType !== 'touch') return;
  const dx = event.clientX - touchStart.x;
  if (Math.abs(dx) > 8) { touchStart.moved = true; scene.setPointerCapture(event.pointerId); moveTo(touchStart.camera - dx); }
});
scene.addEventListener('click', event => { if (touchStart?.moved || suppressDrawClick) { event.preventDefault(); event.stopPropagation(); } }, true);
scene.addEventListener('pointerup', () => { const current = touchStart; setTimeout(() => { if (touchStart === current) touchStart = null; }, 0); });
scene.addEventListener('pointercancel', () => { touchStart = null; });
const progress = $('progressTrack');
progress.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  draggingProgress = true; stopHover(); hideArtworkInfo();
});
progress.addEventListener('input', () => {
  stopHover(); moveTo(Number(progress.value) / 100 * maxCamera, true);
});
for (const event of ['change', 'pointerup', 'pointercancel', 'lostpointercapture', 'blur']) {
  progress.addEventListener(event, () => { draggingProgress = false; });
}
window.addEventListener('resize', resize);
window.addEventListener('blur', stopHover);
document.addEventListener('visibilitychange', () => { stopHover(); if (document.hidden) { cancelAnimationFrame(frameID); frameID = null; } else if (frameID === null) { lastTime = 0; companions.reset(); frameID = requestAnimationFrame(tick); } });

function finishDrawingMode(keepPreview = false) {
  drawing = false; drawingAnchor = null; drawingPointer = null; drawingRectangle = null;
  drawSurface.hidden = true;
  scene.classList.remove('is-drawing'); $('drawWindow').setAttribute('aria-pressed', 'false');
  if (!keepPreview) drawPreview.hidden = true;
}
function beginDrawing(context = null) {
  hideArtworkInfo();
  if (detail.open) detail.close();
  ++loadSequence;
  stopHover(); moveTo(camera, true); touchStart = null;
  drawing = true; drawingContext = context; drawingAnchor = null; drawingRectangle = null; drawingPointer = null;
  drawPreview.hidden = true; drawSurface.hidden = false;
  scene.classList.add('is-drawing'); $('drawWindow').setAttribute('aria-pressed', 'true');
  drawSurface.focus({ preventScroll: true });
}
function cancelDrawing() {
  const context = drawingContext; finishDrawingMode(); drawingContext = null;
  if (context) openEditor(context.record, context.frame, context.values);
  else $('drawWindow').focus({ preventScroll: true });
}
function drawingPoint(event) {
  const rect = scene.getBoundingClientRect();
  return { x: (event.clientX - rect.left + camera) / scale, y: (event.clientY - rect.top - verticalOffset) / scale };
}
function showDrawing(point) {
  drawingRectangle = rectangleFromPoints(drawingAnchor, point, { left: 280, right: worldWidth - 80, top: FRAME_LIMITS.minY, bottom: FRAME_LIMITS.bottom });
  const { x, y, width, height } = drawingRectangle;
  Object.assign(drawPreview.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
  $('drawDimensions').textContent = `${Math.round(width)} × ${Math.round(height)}`;
  drawPreview.hidden = false;
}
$('drawWindow').addEventListener('click', () => { if (drawing) cancelDrawing(); else beginDrawing(); });
document.addEventListener('keydown', event => {
  if (drawing && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelDrawing(); }
});
drawSurface.addEventListener('pointerdown', event => {
  if (!drawing || drawingAnchor || event.button !== 0) return;
  const point = drawingPoint(event);
  if (point.x < 280 || point.x > worldWidth - 80 || point.y < FRAME_LIMITS.minY || point.y > FRAME_LIMITS.bottom) {
    return;
  }
  event.preventDefault(); event.stopPropagation();
  drawingAnchor = point; drawingPointer = event.pointerId;
  drawSurface.setPointerCapture(event.pointerId); showDrawing(point);
});
drawSurface.addEventListener('pointermove', event => {
  if (!drawingAnchor || event.pointerId !== drawingPointer) return;
  event.preventDefault(); showDrawing(drawingPoint(event));
});
drawSurface.addEventListener('pointerup', event => {
  if (!drawingAnchor || event.pointerId !== drawingPointer) return;
  event.preventDefault(); event.stopPropagation(); showDrawing(drawingPoint(event));
  const rectangle = drawingRectangle; drawingAnchor = null; drawingPointer = null;
  if (drawSurface.hasPointerCapture(event.pointerId)) drawSurface.releasePointerCapture(event.pointerId);
  if (rectangle.width < FRAME_LIMITS.minWidth || rectangle.height < FRAME_LIMITS.minHeight) {
    drawPreview.hidden = true; return;
  }
  const frame = { width: Number(rectangle.width.toFixed(1)), height: Number(rectangle.height.toFixed(1)), y: Number(rectangle.y.toFixed(1)) };
  frame.y = Math.min(frame.y, FRAME_LIMITS.bottom - frame.height);
  const context = drawingContext; finishDrawingMode(true); drawingContext = null;
  suppressDrawClick = true; setTimeout(() => { suppressDrawClick = false; }, 0);
  openEditor(context?.record || null, frame, context?.values || null);
});
function abandonStroke() {
  if (!drawingAnchor) return;
  drawingAnchor = null; drawingPointer = null; drawingRectangle = null; drawPreview.hidden = true;
}
drawSurface.addEventListener('pointercancel', abandonStroke);
drawSurface.addEventListener('lostpointercapture', abandonStroke);
window.addEventListener('blur', abandonStroke);
window.addEventListener('resize', abandonStroke);

function revokePreview() { if (previewURL) URL.revokeObjectURL(previewURL); previewURL = null; }
function updateCoverPreview() {
  revokePreview(); const preview = $('coverPreview');
  if (selectedCover) { previewURL = URL.createObjectURL(selectedCover); preview.src = previewURL; preview.hidden = false; }
  else { preview.removeAttribute('src'); preview.hidden = true; }
  $('clearCover').hidden = !selectedCover;
}
function fitEditorFrame() {
  const availableWidth = innerWidth <= 640 ? innerWidth - 88 : Math.min(340, (innerWidth - 170) * .48);
  const previewScale = Math.min(1, availableWidth / draftFrame.width, (innerWidth <= 640 ? 220 : 340) / draftFrame.height);
  $('coverPicker').style.width = `${draftFrame.width * previewScale}px`;
  $('coverPicker').style.aspectRatio = `${draftFrame.width} / ${draftFrame.height}`;
}
function openEditor(record = null, frame = null, values = null) {
  if (!record && !frame) { beginDrawing(); return; }
  stopHover(); if (detail.open) detail.close(); editing = record; form.reset(); $('formError').textContent = '';
  draftFrame = frame || getWindowFrame(record);
  selectedCover = values ? values.cover : record?.cover || null; ++coverSequence; coverDecoding = false; $('saveWindow').disabled = false;
  $('windowTitle').value = values?.title ?? record?.title ?? '';
  $('windowDate').value = values?.date ?? (record ? formatWindowTime(record) : '');
  $('windowMaterial').value = values?.material ?? record?.material ?? '';
  fitEditorFrame();
  $('saveWindow').setAttribute('aria-label', record ? 'Save changes' : 'Save to collection');
  $('saveWindow').title = record ? 'Save changes' : 'Save to collection';
  updateCoverPreview(); editor.showModal();
}
$('redrawWindow').addEventListener('click', () => {
  if (saving || coverDecoding) return;
  const context = { record: editing, frame: draftFrame, values: { title: $('windowTitle').value, date: $('windowDate').value, material: $('windowMaterial').value, cover: selectedCover } };
  editor.close(); beginDrawing(context);
});
$('closeEditor').addEventListener('click', () => { if (!saving) editor.close(); });
editor.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
editor.addEventListener('close', () => { revokePreview(); ++coverSequence; if (!drawing) drawPreview.hidden = true; });
editor.addEventListener('click', event => { if (event.target === editor && !saving) { const r = editor.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) editor.close(); } });
$('clearCover').addEventListener('click', () => { ++coverSequence; coverDecoding = false; $('saveWindow').disabled = false; selectedCover = null; $('coverFile').value = ''; updateCoverPreview(); });
$('coverFile').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const sequence = ++coverSequence; $('formError').textContent = ''; coverDecoding = false; $('saveWindow').disabled = false;
  if (!COVER_TYPES.has(file.type) || !file.size || file.size > MAX_COVER_BYTES) { $('formError').textContent = 'Choose a JPG, PNG, WebP, GIF or AVIF image up to 12 MiB.'; event.target.value = ''; return; }
  coverDecoding = true; $('saveWindow').disabled = true;
  const testURL = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = testURL; await img.decode();
    if (sequence !== coverSequence || !editor.open) return;
    selectedCover = file; updateCoverPreview();
  } catch { if (sequence === coverSequence) { $('formError').textContent = 'This image could not be opened. Choose another cover.'; event.target.value = ''; } }
  finally { URL.revokeObjectURL(testURL); if (sequence === coverSequence) { coverDecoding = false; $('saveWindow').disabled = false; } }
});
form.addEventListener('submit', async event => {
  event.preventDefault(); if (saving || coverDecoding) return;
  saving = true; $('saveWindow').disabled = true; $('redrawWindow').disabled = true; $('formError').textContent = '';
  try {
    const time = parseWindowTime($('windowDate').value);
    const record = await saveWindow({ ...(editing ? { id: editing.id } : {}), title: $('windowTitle').value, ...time, material: $('windowMaterial').value, frame: draftFrame, cover: selectedCover });
    lastSavedID = record.id; editor.close(); await refresh(record.id);
  } catch (error) { $('formError').textContent = error.message; }
  finally { saving = false; $('saveWindow').disabled = false; $('redrawWindow').disabled = false; }
});

function openDetail(record) {
  hideArtworkInfo();
  stopHover(); currentDetail = record; $('deleteConfirm').hidden = true; $('detailError').textContent = '';
  $('detailTitle').textContent = record.title; $('detailDate').textContent = formatWindowTime(record);
  if (detailURL) URL.revokeObjectURL(detailURL); detailURL = imageURL(record);
  const url = detailURL;
  $('detailArt').style.backgroundImage = url ? `url("${url}")` : '';
  $('detailDescription').textContent = record.material || '';
  const actions = $('detailActions'); actions.replaceChildren();
  const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'primary-button'; edit.textContent = 'Edit window ↗';
  edit.addEventListener('click', () => openEditor(record)); actions.append(edit);
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Remove window'; remove.addEventListener('click', () => { $('deleteConfirm').hidden = false; $('cancelDelete').focus(); }); actions.append(remove);
  detail.showModal();
}
$('closeDetail').addEventListener('click', () => detail.close());
detail.addEventListener('close', () => { if (detailURL) URL.revokeObjectURL(detailURL); detailURL = null; });
detail.addEventListener('click', event => { if (event.target === detail) { const r = detail.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) detail.close(); } });
$('cancelDelete').addEventListener('click', () => { $('deleteConfirm').hidden = true; });
$('confirmDelete').addEventListener('click', async () => {
  if (!currentDetail) return;
  $('confirmDelete').disabled = true;
  try { await deleteWindow(currentDetail.id); detail.close(); await refresh(); notify('Window removed.'); }
  catch (error) { $('detailError').textContent = error.message; }
  finally { $('confirmDelete').disabled = false; }
});
window.addEventListener('focus', () => { if (!drawing && !editor.open && !detail.open) refresh(lastSavedID); });
await refresh(); frameID = requestAnimationFrame(tick);

if (globalThis.BLACKDOOR_CONFIG?.shared) {
  setInterval(() => {
    if (!document.hidden && !drawing && !editor.open && !detail.open && !saving) void refresh(lastSavedID);
  }, 8000);
}
