"""Prepare open next-level boundaries, partitioned by country for local lazy loading.

Inputs are cached geoBoundaries gbOpen ADM2 files plus CC BY 4.0 CTAmap 2026
prefectures (and municipality districts). Dependencies stay in the ignored cache.
"""
import hashlib
import json
import math
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/travel-map'
sys.path.insert(0, str(CACHE / 'python-libs'))
from shapely import from_wkb, make_valid
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.strtree import STRtree

OUT = ROOT / 'transition/images/assets/admin2'
OUT.mkdir(parents=True, exist_ok=True)
base = json.loads((ROOT / 'transition/images/assets/world-admin1.json').read_text(encoding='utf-8'))
source = json.loads((CACHE / 'admin1-source.json').read_text(encoding='utf-8'))
metadata = json.loads((CACHE / 'adm-next-metadata.json').read_text(encoding='utf-8'))
by_id = {r['id']:r for r in base['regions']}
aliases = {'PSX':'PSE','SDS':'SSD','KOS':'XKX'}
parents, trees, geometries, province_names = {}, {}, {}, {}
for feature in source['features']:
    p = feature['properties']; iso = aliases.get(p['adm0_a3'],p['adm0_a3'])
    geometry = make_valid(shape(feature['geometry']))
    record = {'id':p['adm1_code'],'geometry':geometry,'iso':iso}
    parents.setdefault(iso,[]).append(record)
    if iso == 'CHN': province_names[p.get('name_zh')] = record
for iso, records in parents.items():
    geometries[iso] = [r['geometry'] for r in records]
    trees[iso] = STRtree(geometries[iso])

def gpkg_rows(path):
    db = sqlite3.connect('file:'+str(path)+'?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    table, column = db.execute('select table_name,column_name from gpkg_geometry_columns').fetchone()
    for row in db.execute(f'select * from "{table}"'):
        data = dict(row); blob = data.pop(column)
        envelope = (blob[3] >> 1) & 7
        offset = 8 + [0,32,48,48,64][envelope]
        yield data, make_valid(from_wkb(blob[offset:]))
    db.close()

def choose_parent(iso, geometry, preferred=None):
    if preferred: return preferred
    if iso not in trees: return None
    point = geometry.representative_point()
    for index in trees[iso].query(point):
        if geometries[iso][index].covers(point): return parents[iso][index]
    candidates = trees[iso].query(geometry)
    best, area = None, 0
    for index in candidates:
        overlap = geometry.intersection(geometries[iso][index]).area
        if overlap > area: best, area = parents[iso][index], overlap
    return best

def polygon_parts(geometry):
    if isinstance(geometry,Polygon): return [geometry]
    if isinstance(geometry,MultiPolygon): return list(geometry.geoms)
    return [p for g in getattr(geometry,'geoms',[]) for p in polygon_parts(g)]

def number(value):
    return format(round(value,3),'.3f').rstrip('0').rstrip('.') or '0'

def polygon_path(geometry):
    paths=[]
    for polygon in polygon_parts(geometry):
        for ring in [polygon.exterior,*polygon.interiors]:
            points=[]
            for lon,lat,*_ in ring.coords:
                if not math.isfinite(lon) or not math.isfinite(lat): continue
                point=f'{number((lon+180)*3)},{number((90-lat)*3)}'
                if not points or point!=points[-1]: points.append(point)
            if len(points)>=4: paths.append('M'+'L'.join(points)+'Z')
    return ''.join(paths)

def prepare(iso,features):
    result=[]; skipped=0
    for name,source_id,geometry,preferred in features:
        if geometry.is_empty: skipped+=1; continue
        parent=choose_parent(iso,geometry,preferred)
        if not parent: skipped+=1; continue
        intersection=geometry.intersection(parent['geometry'])
        if intersection.is_empty: skipped+=1; continue
        point=intersection.representative_point()
        simplified=geometry.simplify(.003,preserve_topology=True)
        path=polygon_path(simplified)
        if not path: skipped+=1; continue
        identifier=f'{iso}-2-'+hashlib.sha256(source_id.encode()).hexdigest()[:12].upper()
        result.append({'id':identifier,'parentId':parent['id'],'name':name or 'Unnamed',
            'center':[round(point.x,5),round(point.y,5)],'path':path})
    return result,skipped

def china_features():
    for data,g in gpkg_rows(CACHE/'chn-prefectures-2026.gpkg'):
        province=str(data['code_1'])
        if province in ['110000','120000','310000','500000','710000','810000','820000']: continue
        yield data['地名'],str(data['code']),g,province_names.get(data['省级'])
    for data,g in gpkg_rows(CACHE/'chn-counties-2026.gpkg'):
        if str(data.get('code_1')) not in ['110000','120000','310000','500000']: continue
        yield data['地名'],str(data.get('code') or data['区划码']),g,province_names.get(data['省级'])

manifest={'version':1,'level':2,'countries':{},'parents':{},'totalRegions':0,'unmatched':json.loads((CACHE/'adm-next-missing.json').read_text(encoding='utf-8'))}
sources=[]; all_ids=[r['id'] for r in base['regions']]
for m in sorted(metadata,key=lambda m:m['boundaryISO']):
    iso=m['boundaryISO']
    if iso not in parents: manifest['unmatched'].append(iso); continue
    if iso=='CHN':
        features=china_features()
        citation={'provider':'CTAmap 2.0 (2026 snapshot)','year':'2026','license':'CC BY 4.0',
            'url':'https://www.shengshixian.com/pages/d35ae5/','doi':'https://doi.org/10.5281/zenodo.22179207',
            'source':'CTAmap contributors'}
    else:
        source_folder = 'adm2' if m['boundaryType']=='ADM2' else 'adm-next'
        data=json.loads((CACHE/f'{source_folder}/{iso}.json').read_text(encoding='utf-8'))
        features=((f['properties'].get('shapeName'),f['properties']['shapeID'],make_valid(shape(f['geometry'])),None)
            for f in data['features'])
        citation={'provider':'geoBoundaries gbOpen','year':m['boundaryYearRepresented'],'license':m['boundaryLicense'],
            'url':m['simplifiedGeometryGeoJSON'],'source':m['boundarySource'],'licenseSource':m['licenseSource'],
            'boundaryID':m['boundaryID'],'licenseDetail':m.get('licenseDetail','')}
    regions,skipped=prepare(iso,features)
    if not regions: manifest['unmatched'].append(iso); continue
    ids=[r['id'] for r in regions]
    if len(ids)!=len(set(ids)): raise ValueError(f'Duplicate IDs in {iso}')
    all_ids.extend(ids)
    parent_ids=sorted({r['parentId'] for r in regions})
    bounds=[parents[iso][i]['geometry'].bounds for i in range(len(parents[iso]))]
    bbox=[round((min(b[0] for b in bounds)+180)*3,3),round((90-max(b[3] for b in bounds))*3,3),
        round((max(b[2] for b in bounds)+180)*3,3),round((90-min(b[1] for b in bounds))*3,3)]
    payload={'country':iso,'level':2,'sourceLevel':m['boundaryType'] if iso!='CHN' else 'prefecture/municipality district','regions':regions,'attribution':citation,
        'modifications':'Simplified for display; projected; grouped by parent; clipped to parent in renderer.'}
    output=json.dumps(payload,ensure_ascii=False,separators=(',',':'))
    if len(output.encode())>24*1024*1024: raise ValueError(f'Oversized country file {iso}')
    (OUT/f'{iso}.json').write_text(output,encoding='utf-8')
    manifest['countries'][iso]={'file':f'{iso}.json','count':len(regions),'bbox':bbox,'parents':parent_ids,'sourceCountSkipped':skipped}
    for parent_id in parent_ids: manifest['parents'][parent_id]=iso
    manifest['totalRegions']+=len(regions)
    sources.append({'country':iso,**citation})
    print(f'{iso}: {len(regions)} next-level regions ({skipped} without matching parent)',flush=True)

(OUT/'index.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(OUT/'sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2),encoding='utf-8')
for stale in OUT.glob('???.json'):
    if stale.stem not in manifest['countries'] and stale.resolve().parent == OUT.resolve(): stale.unlink()
(ROOT/'supabase/functions/travel-colors/region-ids.json').write_text(json.dumps(all_ids,separators=(',',':')),encoding='utf-8')
print(json.dumps({'countries':len(manifest['countries']),'regions':manifest['totalRegions'],'unmatched':manifest['unmatched']}),flush=True)
