import { readFile, writeFile, mkdir } from 'node:fs/promises';

// Natural Earth v5.1.1, Admin 1: all 4,596 provinces/states, including small islands.
// Download the official GeoJSON once into the ignored cache before running this.
const source = JSON.parse(await readFile('.cache/travel-map/admin1-source.json', 'utf8'));
const number = value => Number(value.toFixed(2));
function simplify(points, tolerance = .02) {
  if (points.length <= 4) return points;
  const keep = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(), [x, y] = points[a], [ex, ey] = points[b];
    const dx = ex - x, dy = ey - y, length = dx * dx + dy * dy;
    let farthest = tolerance * tolerance, at = -1;
    for (let i = a + 1; i < b; i++) {
      const t = length ? Math.max(0, Math.min(1, ((points[i][0] - x) * dx + (points[i][1] - y) * dy) / length)) : 0;
      const distance = (points[i][0] - x - t * dx) ** 2 + (points[i][1] - y - t * dy) ** 2;
      if (distance > farthest) { farthest = distance; at = i; }
    }
    if (at >= 0) { keep.add(at); stack.push([a, at], [at, b]); }
  }
  const reduced = points.filter((_, i) => keep.has(i));
  return reduced.length >= 4 ? reduced : points;
}
function ringPath(ring) {
  const points = ring.map(([lon, lat]) => [number((lon + 180) * 3), number((90 - lat) * 3)]);
  const retained = points.filter((p, i) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  // Keep even the smallest islands selectable rather than dropping subpixel polygons.
  const outline = retained.length < 4 ? ring.map(([lon, lat]) => [Number(((lon + 180) * 3).toFixed(5)), Number(((90 - lat) * 3).toFixed(5))]) : simplify(retained);
  return 'M' + outline.map(p => p.join(',')).join('L') + 'Z';
}
const regions = source.features.map(({ properties: p, geometry: g }) => ({
  id: p.adm1_code, name: p.name_zh || p.name || p.admin,
  country: p.iso_a2, countryName: p.admin,
  center: [p.longitude,p.latitude],
  path: (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flatMap(rings => rings.map(ringPath)).join('')
}));
// Static line hierarchy for the monochrome base. No zoom-dependent detail layers.
const outlines = {};
for (const [name, file] of [['coast', 'ne_10m_coastline'], ['country', 'ne_10m_admin_0_boundary_lines_land']]) {
  const collection = JSON.parse(await readFile(`.cache/travel-map/${file}.json`, 'utf8'));
  outlines[name] = collection.features.flatMap(({ geometry: g }) => {
    const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    return lines.map(line => 'M' + simplify(line.map(([lon, lat]) => [number((lon+180)*3),number((90-lat)*3)]))
      .map(point => point.join(',')).join('L'));
  });
}
if (regions.length !== 4596 || new Set(regions.map(r => r.id)).size !== regions.length || regions.some(r => !r.path)) {
  throw new Error('Incomplete or duplicate administrative regions');
}
await mkdir('supabase/functions/travel-colors', { recursive: true });
await writeFile('transition/images/assets/world-admin1.json', JSON.stringify({ width: 1080, height: 540, regions, outlines }));
await writeFile('supabase/functions/travel-colors/region-ids.json', JSON.stringify(regions.map(r => r.id)));
console.log(`Prepared ${regions.length} administrative regions.`);
