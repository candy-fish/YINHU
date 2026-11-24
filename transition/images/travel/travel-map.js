import { createTravelStore } from './travel-store.js';
import { setupColorPicker } from './color-picker.js';
import { mapCoordinates,formatCoordinates } from './map-location.js';
import { createAdminDetail } from './admin-detail.js';

const $ = id => document.getElementById(id);
const dialog = $('travelAtlas'), viewport = $('mapViewport'), svg = $('adminMap');
const group = $('mapRegions'), status = $('mapStatus'), regionName = $('regionName');
const drawButton = $('drawMap');
const store = createTravelStore();
const regions = new Map(), rows = new Map(), pending = new Map();
let selected = '#d4df8b', drawing = false, cloudReady = false, fetching = false;
let mapPromise, poll, scale = 1, panX = 0, panY = 0, gesture = null, moved = false, mutationEpoch = 0;
const pointers = new Map();
const adminDetail=createAdminDetail({svg,regions,rows,register:registerRegion,
  onReady:()=>{for(const [id] of regions) fill(id,rows.get(id)?.color);},onError:error=>message(error.message,true)});

function message(text, error = false) { status.textContent = text; status.classList.toggle('is-error', error); }
const picker = setupColorPicker({ initial:selected, onChange:color => { selected = color; } });
drawButton.addEventListener('click', () => {
  drawing = !drawing; drawButton.setAttribute('aria-pressed', String(drawing));
  picker.setEnabled(drawing); dialog.classList.toggle('is-drawing',drawing); viewport.classList.toggle('is-drawing', drawing);
  if (cloudReady) message('');
});

function pointerCoordinates(event) {
  const matrix = svg.getScreenCTM(); if (!matrix) return null;
  const point = new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
  return mapCoordinates(point.x,point.y);
}
function showLocation(region,coordinates) {
  if (!coordinates && region?.center) coordinates = { longitude:region.center[0],latitude:region.center[1] };
  if (!coordinates) return;
  $('locationInfo').hidden = false;
  $('locationCountry').textContent = region?.countryLabel || '';
  $('locationParent').textContent=region?.parentName || '';
  $('locationParent').hidden=!region?.parentName;
  regionName.textContent = region?.name || '海域';
  const coordinateCells = formatCoordinates(coordinates).split('\n').flatMap(line => line.split(' ').map(text => {
    const cell = document.createElement('span'); cell.textContent = text; return cell;
  }));
  $('locationCoordinates').replaceChildren(...coordinateCells);
}

function fill(id, color) {
  const region=regions.get(id); if (!region?.element || region.appliedColor===(color||null)) return;
  region.appliedColor=color||null;
  region.element.style.fill=color||''; region.element.classList.toggle('is-painted',!!color);
}
function registerRegion(region) {
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',region.path); path.dataset.region=region.id;
  path.setAttribute('fill-rule','evenodd'); path.setAttribute('vector-effect','non-scaling-stroke');
  path.setAttribute('role','button'); path.setAttribute('tabindex','0'); path.setAttribute('aria-label',region.label);
  const title=document.createElementNS('http://www.w3.org/2000/svg','title'); title.textContent=region.label; path.append(title);
  region.element=path; regions.set(region.id,region); fill(region.id,rows.get(region.id)?.color);
  return path;
}
function transform() {
  const limitX = viewport.clientWidth * (scale - 1) / 2, limitY = viewport.clientHeight * (scale - 1) / 2;
  panX = Math.max(-limitX, Math.min(limitX, panX)); panY = Math.max(-limitY, Math.min(limitY, panY));
  const width = viewport.clientWidth, height = viewport.clientHeight;
  if (!width || !height) return;
  const units = Math.max(1080 / width, 540 / height) / scale;
  // Changing the vector viewBox rerenders outlines at the display resolution.
  // CSS scale/will-change would reuse a rasterized layer and blur it at high zoom.
  const x=(1080-width*units)/2-panX*units,y=(540-height*units)/2-panY*units,w=width*units,h=height*units;
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  adminDetail.update(scale,[x,y,x+w,y+h]);
  $('zoomOut').disabled = scale <= 1; $('zoomIn').disabled = scale >= 32;
}
function zoom(next, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
  next = Math.max(1, Math.min(32, next));
  panX = (panX - x + viewport.clientWidth / 2) * next / scale + x - viewport.clientWidth / 2;
  panY = (panY - y + viewport.clientHeight / 2) * next / scale + y - viewport.clientHeight / 2;
  scale = next; transform();
}
$('zoomIn').addEventListener('click', () => zoom(scale * 1.6));
$('zoomOut').addEventListener('click', () => zoom(scale / 1.6));
$('resetMap').addEventListener('click', () => { scale = 1; panX = panY = 0; transform(); });
viewport.addEventListener('wheel', event => {
  event.preventDefault(); const rect = viewport.getBoundingClientRect();
  zoom(scale * Math.exp(-event.deltaY * .0015), event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });
viewport.addEventListener('keydown', event => {
  if (event.target !== viewport) return;
  if (['+', '='].includes(event.key)) zoom(scale * 1.4);
  else if (event.key === '-') zoom(scale / 1.4);
  else if (event.key === 'ArrowLeft') panX += 50;
  else if (event.key === 'ArrowRight') panX -= 50;
  else if (event.key === 'ArrowUp') panY += 50;
  else if (event.key === 'ArrowDown') panY -= 50;
  else return;
  event.preventDefault(); transform();
});
function startGesture() {
  const points = [...pointers.values()];
  if (points.length === 1) gesture = { x: points[0].x, y: points[0].y, panX, panY };
  else {
    const [a, b] = points;
    gesture = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale,
      x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    moved = true;
  }
}
viewport.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  if (!pointers.size) moved = false;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  viewport.setPointerCapture(event.pointerId); startGesture();
});
viewport.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId)) {
    const region = regions.get(event.target.closest?.('[data-region]')?.dataset.region);
    if (region) showLocation(region,pointerCoordinates(event)); return;
  }
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const points = [...pointers.values()];
  if (points.length === 1 && !gesture.distance) {
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (Math.hypot(dx, dy) > 5) moved = true;
    if (moved) { panX = gesture.panX + dx; panY = gesture.panY + dy; transform(); }
  } else if (points.length > 1 && gesture.distance) {
    const [a, b] = points, rect = viewport.getBoundingClientRect();
    zoom(gesture.scale * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance,
      (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
  }
});
async function paint(id) {
  const region = regions.get(id);
  if (!region) return;
  if (!drawing) return;
  if (!cloudReady) { message('尚未连接共享服务，请稍后重试', true); return; }
  if (pending.has(id)) return;
  const previous = rows.get(id), color = selected;
  if ((previous?.color || null) === color) return;
  mutationEpoch++; pending.set(id, color); fill(id, color); message('正在保存到共享地图…');
  try {
    const saved = await store.paint(id, color, previous?.version || 0);
    rows.set(id, saved); fill(id, saved.color);
    message(pending.size > 1 ? '正在保存…' : '');
  } catch (error) {
    if (error.status === 409) {
      if (error.remote) rows.set(id, error.remote); else rows.delete(id);
      fill(id, error.remote?.color);
      message('此地区已被其他设备修改，已显示最新颜色；可再次点击涂色', true);
    } else { fill(id, previous?.color); message('保存失败，未保存的颜色已撤回；请重试', true); }
  } finally { mutationEpoch++; pending.delete(id); }
}
function release(event) {
  if (!pointers.has(event.pointerId)) return;
  const single = pointers.size === 1;
  pointers.delete(event.pointerId);
  if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  if (single && !moved && event.type === 'pointerup') {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-region]');
    if (target) { showLocation(regions.get(target.dataset.region),pointerCoordinates(event)); paint(target.dataset.region); }
  }
  if (pointers.size) startGesture(); else gesture = null;
}
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(name, release);
svg.addEventListener('keydown', event => {
  if (['Enter', ' '].includes(event.key) && event.target.dataset.region) { event.preventDefault(); paint(event.target.dataset.region); }
});
svg.addEventListener('focusin',event => { const region = regions.get(event.target.dataset.region); if (region) showLocation(region); });
async function loadMap() {
  const response = await fetch(new URL('./world-admin1.json', import.meta.url));
  if (!response.ok) throw new Error('地图加载失败，请重新打开。');
  const data = await response.json(), fragment = document.createDocumentFragment();
  const countries = new Intl.DisplayNames(['zh-CN'], { type: 'region' });
  for (const region of data.regions) {
    const country = /^[A-Z]{2}$/.test(region.country) ? countries.of(region.country) : region.countryName;
    region.countryLabel = country;
    region.label = `${country} · ${region.name}`;
    fragment.append(registerRegion(region));
  }
  group.append(fragment);
  const contours = $('mapContours');
  for (const [kind, paths] of Object.entries(data.outlines || {})) {
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('class', `map-contour-${kind}`);
    for (const d of paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d); path.setAttribute('vector-effect', 'non-scaling-stroke'); layer.append(path);
    }
    contours.append(layer);
  }
  await adminDetail.init();
}
async function refresh() {
  if (fetching || pending.size || !dialog.open || document.hidden) return;
  const epoch = mutationEpoch;
  fetching = true;
  try {
    const saved = await store.list();
    // A read started before a paint must never revert that completed paint.
    if (epoch !== mutationEpoch) return;
    const remote = new Map(saved.map(row => [row.regionId, row]));
    for (const id of rows.keys()) if (!pending.has(id) && !remote.has(id)) rows.delete(id);
    for (const [id,row] of remote) if (!pending.has(id)) rows.set(id,row);
    for (const [id] of regions) if (!pending.has(id)) {
      const row = remote.get(id);
      fill(id, row?.color);
    }
    adminDetail.savedChanged();
    const wasReady = cloudReady; cloudReady = true;
    if (!wasReady) message('');
  } catch { if (!cloudReady) message('共享服务暂时不可用，正在重试…', true); }
  finally { fetching = false; }
}
$('openAtlas').addEventListener('click', async () => {
  dialog.showModal(); document.dispatchEvent(new CustomEvent('travel-map-visibility', { detail: true }));
  try {
    mapPromise ||= loadMap().catch(error => { mapPromise = null; throw error; });
    await mapPromise;
    if (!dialog.open) return;
    transform(); await refresh();
    clearInterval(poll); if (dialog.open) poll = setInterval(refresh, 12000);
  } catch (error) { message(error.message, true); }
});
$('closeAtlas').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  clearInterval(poll); pointers.clear(); gesture = null;
  document.dispatchEvent(new CustomEvent('travel-map-visibility', { detail: false })); $('openAtlas').focus();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('focus', refresh);
window.addEventListener('resize', transform);
