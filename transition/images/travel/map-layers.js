const svgNamespace = 'http://www.w3.org/2000/svg';
const layerDirectory = new URL('./map-layers/', import.meta.url);
const layers = {
  climate: {
    type: 'surface', image: true, caption: '柯本气候 · 1991–2020'
  },
  relief: {
    type: 'surface', image: true, caption: '海拔与晕渲',
    key: [['深海', '#20313a'], ['低地', '#36463b'], ['1,000 m', '#68744c'], ['2,500 m', '#937954'], ['5,000 m', '#d1c4a2']]
  },
  temperature: { type: 'contour', caption: '年均气温 · 1991–2020', unit: '°C' },
  rainfall: { type: 'contour', caption: '年降水量 · 1991–2020', unit: 'mm' },
  rivers: { caption: '主要河流与湖泊' },
  graticule: { caption: '经纬网 · 30° 间隔' }
};

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function legendSample(color, line = false) {
  const sample = document.createElement('i');
  sample.style.setProperty('--sample', color);
  if (line) sample.classList.add('is-line');
  return sample;
}

function legendSwatches(swatches, line) {
  const list = document.createElement('ul');
  for (const [label, color, code] of swatches) {
    const item = document.createElement('li');
    item.append(legendSample(color, line));
    if (code) {
      const symbol = document.createElement('code');
      symbol.textContent = code;
      item.append(symbol);
    }
    item.append(label);
    list.append(item);
  }
  return list;
}

function buildLegend(layer, key, groups) {
  const section = document.createElement('section');
  section.setAttribute('aria-label', layer.caption);
  if (!groups) {
    const list = legendSwatches(key, !layer.image);
    if (layer.unit) list.lastElementChild.append(` ${layer.unit}`);
    section.append(list);
    return section;
  }

  section.className = 'climate-legend';
  section.tabIndex = 0;
  for (const [name, swatches] of groups) {
    const group = document.createElement('details');
    group.setAttribute('name', 'climate-legend');
    const summary = document.createElement('summary');
    const strip = document.createElement('span');
    strip.className = 'climate-swatches';
    strip.setAttribute('aria-hidden', 'true');
    strip.append(...swatches.map(([, color]) => legendSample(color)));
    summary.append(name, strip);
    group.append(summary, legendSwatches(swatches, false));
    section.append(group);
  }
  return section;
}

function graticuleData() {
  // Use the same equirectangular coordinates as the administrative map.
  const parallelY = latitude => (90 - latitude) * 3;
  const meridianX = longitude => (180 + longitude) * 3;
  const parallel = latitude => `M0 ${parallelY(latitude)}h1080`;
  const meridian = longitude => `M${meridianX(longitude)} 0v540`;
  const grid = [];
  for (let longitude = -150; longitude <= 150; longitude += 30) {
    if (longitude !== 0) grid.push(meridian(longitude));
  }
  for (const latitude of [-60, -30, 30, 60]) grid.push(parallel(latitude));

  const axis = '#dfe6a5', tropic = '#d6ad84', polar = '#9bc7d7', opposite = '#b3acc8';
  const tilt = 23 + 26 / 60;
  const circle = 90 - tilt;
  const paths = [
    { d: grid.join(''), stroke: '#71887c', opacity: .44, width: .55, dash: '2 5' },
    { d: parallel(circle) + parallel(-circle), stroke: polar, opacity: .85, width: .9, dash: '2 4' },
    { d: parallel(tilt) + parallel(-tilt), stroke: tropic, opacity: .88, width: .95, dash: '6 4' },
    { d: meridian(-180) + meridian(180), stroke: opposite, opacity: .72, width: .85, dash: '5 4' },
    { d: parallel(0) + meridian(0), stroke: axis, opacity: .86, width: 1.05 }
  ];
  const labels = [
    { text: '66°34′ N', x: 24, y: parallelY(circle), dy: '-.48em', color: polar },
    { text: '23°26′ N', x: 24, y: parallelY(tilt), dy: '-.48em', color: tropic },
    { text: '0°', x: 24, y: parallelY(0), dy: '-.48em', color: axis },
    { text: '23°26′ S', x: 24, y: parallelY(-tilt), dy: '-.48em', color: tropic },
    { text: '66°34′ S', x: 24, y: parallelY(-circle), dy: '-.48em', color: polar },
    { text: '0°', x: meridianX(0), y: 41, dx: '.55em', color: axis },
    { text: '180°', x: meridianX(180), y: 41, dx: '-.55em', anchor: 'end', color: opposite }
  ];
  const key = [['0°', axis], ['23°26′ N/S', tropic], ['66°34′ N/S', polar], ['180°', opposite]];
  return { paths, labels, key };
}

export function setupMapLayers({ svg, surface, overlays, controls, legend, status }) {
  const buttons = [...controls.querySelectorAll('[data-layer]')];
  const active = new Set(), loaded = new Map();

  async function load(id) {
    const layer = layers[id];
    const node = svgElement('g', { class: `theme-layer theme-${id}` });
    let key = layer.key;
    let groups;
    if (layer.image) {
      if (id === 'climate') ({ groups } = await loadData(id));
      const image = svgElement('image', { width: 1080, height: 540 });
      await new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', () => reject(new Error(id)), { once: true });
        node.style.display = 'none';
        node.append(image);
        surface.append(node);
        image.setAttribute('href', new URL(`${id}.webp`, layerDirectory).href);
      }).catch(error => { node.remove(); throw error; });
    } else {
      const data = id === 'graticule' ? graticuleData() : await loadData(id);
      key = data.key || key;
      for (const { d, fill = 'none', stroke, width, opacity, dash } of data.paths) {
        const path = svgElement('path', { d, fill, stroke, 'stroke-width': width,
          'stroke-opacity': opacity, 'fill-rule': 'evenodd', 'vector-effect': 'non-scaling-stroke' });
        if (dash) path.setAttribute('stroke-dasharray', dash);
        node.append(path);
      }
      for (const { text, x, y, dx = 0, dy = 0, anchor = 'start', color } of data.labels || []) {
        const label = svgElement('text', { x, y, dx, dy, 'text-anchor': anchor, fill: color });
        label.textContent = text;
        node.append(label);
      }
    }
    return { node, legendSection: buildLegend(layer, key, groups) };
  }

  async function loadData(id) {
    const response = await fetch(new URL(`${id}.json`, layerDirectory));
    if (!response.ok) throw new Error(id);
    return response.json();
  }

  function render() {
    const legendSections = [];
    let hasSurface = false;
    for (const [id, { node }] of loaded) {
      node.style.display = 'none';
      if (!active.has(id) && !layers[id].image) node.remove();
    }
    // Layer order stays fixed when buttons are toggled in different sequences.
    for (const [id, layer] of Object.entries(layers)) {
      const data = loaded.get(id);
      if (!active.has(id) || !data) continue;
      if (layer.image) hasSurface = true;
      else overlays.append(data.node);
      data.node.style.display = '';
      legendSections.push(data.legendSection);
    }
    legend.replaceChildren(...legendSections);
    svg.classList.toggle('has-map-surface', hasSurface);
    legend.hidden = !legend.childElementCount;
    for (const button of buttons) button.setAttribute('aria-pressed', String(active.has(button.dataset.layer)));
  }

  for (const button of buttons) button.addEventListener('click', async () => {
    const id = button.dataset.layer, type = layers[id].type;
    const enabled = !active.has(id);
    if (enabled && type) {
      for (const other of active) if (layers[other].type === type) active.delete(other);
    }
    if (enabled) active.add(id); else active.delete(id);
    status.textContent = '';
    render();
    if (!enabled || loaded.has(id) || button.hasAttribute('aria-busy')) return;

    button.setAttribute('aria-busy', 'true');
    try {
      loaded.set(id, await load(id));
    } catch {
      if (active.delete(id)) status.textContent = `${button.title}加载失败，请重试。`;
    } finally {
      button.removeAttribute('aria-busy');
      render();
    }
  });
}
