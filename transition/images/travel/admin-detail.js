const NS = 'http://www.w3.org/2000/svg';

export function intersects(a,b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

// Fetch only countries in the enlarged view (plus countries with saved child colors).
export function createAdminDetail({ svg,regions,rows,register,onReady,onError }) {
  const layer = document.getElementById('mapSubregions'), defs = document.getElementById('subregionClips');
  const loaded = new Set(), queued = new Set(), failedUntil = new Map(), parentGroups = new Map();
  let index, active=0, detail=false, timer, currentScale=1, view=[0,0,1080,540];
  const queue=[];
  function setDetail(enabled) {
    if (detail === enabled) return;
    detail=enabled; svg.classList.toggle('is-admin-detail',detail);
    for (const path of layer.querySelectorAll('[data-region]')) path.setAttribute('tabindex',detail?'0':'-1');
  }
  function enqueue(iso) {
    if (!index?.countries[iso] || loaded.has(iso) || queued.has(iso) || (failedUntil.get(iso)||0)>Date.now()) return;
    queued.add(iso); queue.push(iso);
  }
  async function loadCountry(iso) {
    const response=await fetch(new URL(`./admin2/${index.countries[iso].file}`,import.meta.url),{signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`行政区加载失败 (${iso})`);
    const data=await response.json();
    for (const child of data.regions) {
      const parent=regions.get(child.parentId); if (!parent || regions.has(child.id)) continue;
      let group=parentGroups.get(parent.id);
      if (!group) {
        const clip=document.createElementNS(NS,'clipPath'), outline=document.createElementNS(NS,'path');
        const clipId=`subregion-clip-${parentGroups.size}`;
        clip.id=clipId; clip.setAttribute('clipPathUnits','userSpaceOnUse');
        outline.setAttribute('d',parent.path); outline.setAttribute('clip-rule','evenodd'); clip.append(outline); defs.append(clip);
        group=document.createElementNS(NS,'g'); group.setAttribute('clip-path',`url(#${clipId})`);
        layer.append(group); parentGroups.set(parent.id,group);
      }
      child.countryLabel=parent.countryLabel; child.parentName=parent.name;
      child.label=`${parent.countryLabel} · ${parent.name} · ${child.name}`;
      const path=register(child); path.setAttribute('tabindex',detail?'0':'-1'); group.append(path);
    }
    loaded.add(iso); onReady();
  }
  function pump() {
    while (active<2 && queue.length) {
      const iso=queue.shift(); active++;
      loadCountry(iso).catch(error=>{failedUntil.set(iso,Date.now()+30000);onError(error);})
        .finally(()=>{active--;queued.delete(iso);pump();});
    }
  }
  function schedule() {
    if (!index) return;
    if (currentScale>=3) {
      for (const [iso,country] of Object.entries(index.countries)) {
        const b=country.bbox;
        if (intersects(view,b) && Math.max((b[2]-b[0])/(view[2]-view[0])*svg.clientWidth,
          (b[3]-b[1])/(view[3]-view[1])*svg.clientHeight)>=28) enqueue(iso);
      }
    }
    for (const id of rows.keys()) { const match=/^([A-Z]{3})-2-/.exec(id); if (match) enqueue(match[1]); }
    pump();
  }
  return {
    async init() {
      const response=await fetch(new URL('./admin2/index.json',import.meta.url));
      if (!response.ok) throw new Error('下一级行政区索引加载失败。');
      index=await response.json(); schedule();
    },
    update(scale,box) {
      currentScale=scale; view=box; setDetail(scale>=3);
      clearTimeout(timer); timer=setTimeout(schedule,120);
    },
    savedChanged:schedule
  };
}
