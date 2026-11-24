import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createTravelHandler } from '../supabase/functions/travel-colors/handler.mjs';
import { createTravelStore } from '../transition/images/travel/travel-store.js';
import { hexToHSV, hsvToHex,hexToHSL,hslToHex } from '../transition/images/travel/color-picker.js';
import { mapCoordinates,formatCoordinates } from '../transition/images/travel/map-location.js';
import { intersects } from '../transition/images/travel/admin-detail.js';

test('continuous palette preserves arbitrary RGB colors, hue wrap and gray extremes', () => {
  const colors = ['#000000','#ffffff','#ff0000','#00ff00','#0000ff','#d4df8b','#39a1f2','#a3824d','#808080'];
  for (let n = 0; n < 256; n++) colors.push('#' + [n,(n*73)%256,(n*151)%256].map(c=>c.toString(16).padStart(2,'0')).join(''));
  for (const hex of colors) {
    const {h,s,v} = hexToHSV(hex); assert.equal(hsvToHex(h,s,v), hex);
    const hsl = hexToHSL(hex); assert.equal(hslToHex(hsl.h,hsl.s,hsl.l),hex);
  }
  assert.equal(hsvToHex(360,1,1), '#ff0000');
  assert.equal(hsvToHex(-120,1,1), '#0000ff');
  assert.throws(()=>hexToHSV('#xyzxyz'));
  assert.equal(hslToHex(205,1,0),'#000000');
  assert.equal(hslToHex(205,1,1),'#ffffff');
  assert.equal(hslToHex(120,1,.5),'#00ff00');
});

test('map coordinates preserve hemispheres and reject margins outside the world',()=>{
  assert.deepEqual(mapCoordinates(540,270),{longitude:0,latitude:0});
  assert.deepEqual(mapCoordinates(0,0),{longitude:-180,latitude:90});
  assert.deepEqual(mapCoordinates(1080,540),{longitude:180,latitude:-90});
  assert.equal(mapCoordinates(-1,270),null);
  assert.equal(mapCoordinates(540,541),null);
  assert.equal(formatCoordinates({latitude:-33.9249,longitude:18.4241}),'33.9249° S\n18.4241° E');
});

test('independent devices share colors; stale edits cannot overwrite newer colors', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(await readFile(new URL('../supabase/migrations/20261118204633_travel_region_colors.sql', import.meta.url), 'utf8'));
    const repository = {
      list: async () => (await db.query('select * from blackdoor_travel_regions')).rows,
      get: async id => (await db.query('select * from blackdoor_travel_regions where region_id=$1', [id])).rows[0],
      async save(id, color, version) {
        if (version === 0) return (await db.query('insert into blackdoor_travel_regions(region_id,color) values($1,$2) on conflict do nothing returning *', [id, color])).rows[0];
        return (await db.query('update blackdoor_travel_regions set color=$1,version=version+1 where region_id=$2 and version=$3 returning *', [color, id, version])).rows[0];
      }
    };
    const china=JSON.parse(await readFile(new URL('../transition/images/assets/admin2/CHN.json',import.meta.url),'utf8'));
    const chengdu=china.regions.find(region=>region.name==='成都市'); assert.ok(chengdu);
    const handler = createTravelHandler({ repository, allowedKeys: ['test-key'], regionIDs: ['CHN-1180', 'CHN-1820',chengdu.id] });
    const config = { apiBase: 'https://example.supabase.co/functions/v1/blackdoor', publicApiKey: 'test-key' };
    const fetcher = (url, options) => handler(new Request(url, options));
    const a = createTravelStore({ config, fetcher }), b = createTravelStore({ config, fetcher });
    assert.deepEqual(await a.list(), []);
    const first = await a.paint('CHN-1180', '#86cbb7', 0);
    assert.equal((await b.list())[0].color, '#86cbb7');
    const newer = await b.paint(first.regionId, '#84b9dd', first.version);
    await assert.rejects(a.paint(first.regionId, '#df9caa', first.version), e => e.status === 409 && e.remote.color === '#84b9dd');
    await assert.rejects(a.paint(first.regionId, '#df9caa', 0), e => e.status === 409);
    await a.paint('CHN-1820', '#d4df8b', 0);
    assert.equal((await b.list()).length, 2);
    await b.paint(first.regionId, null, newer.version);
    assert.equal((await a.list()).find(r => r.regionId === first.regionId).color, null);
    const city=await a.paint(chengdu.id,'#6699cc',0);
    assert.equal((await b.list()).find(r=>r.regionId===chengdu.id).color,'#6699cc');
    await assert.rejects(b.paint(chengdu.id,'#ff0000',0),e=>e.status===409&&e.remote.version===city.version);
    for (const [id, body] of [['unknown', {color:'#ffffff',version:0}], ['CHN-1180', {color:'red',version:3}],
      ['CHN-1180', {color:'#ffffff',version:-1}], ['CHN-1180', {color:'#ffffff',version:3,admin:true}]]) {
      const response = await handler(new Request(config.apiBase.replace('blackdoor', 'travel-colors') + '/api/regions/' + id,
        {method:'PUT',headers:{apikey:'test-key'},body:JSON.stringify(body)}));
      assert.ok([400,404].includes(response.status));
    }
    assert.equal((await handler(new Request('https://example/api/regions'))).status, 401);
    const rls = await db.query("select relrowsecurity from pg_class where relname='blackdoor_travel_regions'");
    assert.equal(rls.rows[0].relrowsecurity, true);
    const grants = await db.query("select has_table_privilege('anon','blackdoor_travel_regions','select') as anon, has_table_privilege('authenticated','blackdoor_travel_regions','update') as authenticated");
    assert.deepEqual(grants.rows[0], {anon:false,authenticated:false});
  } finally { await db.close(); }
});

test('map retains all administrative region IDs and valid polygon paths', async () => {
  const map = JSON.parse(await readFile(new URL('../transition/images/assets/world-admin1.json', import.meta.url), 'utf8'));
  const ids = JSON.parse(await readFile(new URL('../supabase/functions/travel-colors/region-ids.json', import.meta.url), 'utf8'));
  assert.equal(map.regions.length, 4596);
  assert.equal(new Set(ids).size,ids.length);
  const allowed=new Set(ids);
  assert.ok(map.regions.every(r=>allowed.has(r.id)));
  assert.ok(map.regions.every(r => r.name && /^M[-\d.,LMZ]+Z$/.test(r.path)));
  assert.ok(map.regions.find(r => r.id === 'CHN-1180'));
  assert.ok(map.regions.every(r=>r.center.length===2 && Number.isFinite(r.center[0]) && Math.abs(r.center[0])<=180 && Number.isFinite(r.center[1]) && Math.abs(r.center[1])<=90));
  assert.deepEqual(Object.keys(map.outlines).sort(), ['coast','country']);
  assert.ok(Object.values(map.outlines).every(paths=>paths.length>0 && paths.every(path=>/^M[-\d.,L]+$/.test(path))));
  const index=JSON.parse(await readFile(new URL('../transition/images/assets/admin2/index.json',import.meta.url),'utf8'));
  const parents=new Set(map.regions.map(r=>r.id)); let total=0;
  for(const [iso,country] of Object.entries(index.countries)){
    const data=JSON.parse(await readFile(new URL('../transition/images/assets/admin2/'+country.file,import.meta.url),'utf8'));
    assert.equal(data.regions.length,country.count); total+=data.regions.length;
    assert.ok(data.regions.every(r=>r.id.startsWith(iso+'-2-')&&allowed.has(r.id)&&parents.has(r.parentId)&&/^M[-\d.,LMZ]+Z$/.test(r.path)));
  }
  assert.equal(total,index.totalRegions);
  assert.equal(ids.length,map.regions.length+total);
  const china=JSON.parse(await readFile(new URL('../transition/images/assets/admin2/CHN.json',import.meta.url),'utf8'));
  assert.equal(china.regions.find(r=>r.name==='成都市').parentId,'CHN-1809');
  assert.ok(china.regions.some(r=>r.name==='黄浦区'&&r.parentId==='CHN-1819'));
});

test('country visibility includes edge intersections and excludes offscreen files',()=>{
  assert.equal(intersects([0,0,10,10],[10,5,20,8]),true);
  assert.equal(intersects([0,0,10,10],[11,5,20,8]),false);
});
