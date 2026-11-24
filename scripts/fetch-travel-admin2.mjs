import { mkdir,readFile,writeFile,access } from 'node:fs/promises';

const cache='.cache/travel-map';
await mkdir(`${cache}/adm2`,{recursive:true}); await mkdir(`${cache}/adm-next`,{recursive:true});
async function download(url,file) {
  try { await access(file); return; } catch {}
  const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
  if(!response.ok) throw new Error(`${response.status}: ${url}`);
  await writeFile(file,Buffer.from(await response.arrayBuffer()));
}
const levels=await Promise.all([2,3,4,5].map(async level=>{
  const response=await fetch(`https://www.geoboundaries.org/api/current/gbOpen/ALL/ADM${level}/`);
  if(!response.ok)throw new Error(`Metadata ${response.status}`);
  const data=await response.json(); await writeFile(`${cache}/adm${level}-metadata.json`,JSON.stringify(data)); return data;
}));
const base=JSON.parse(await readFile(`${cache}/admin1-source.json`,'utf8'));
const aliases={PSX:'PSE',SDS:'SSD',KOS:'XKX'},counts={};
for(const feature of base.features){const raw=feature.properties.adm0_a3,iso=aliases[raw]||raw;counts[iso]=(counts[iso]||0)+1;}
const chosen=[],missing=[];
for(const m of levels[0]) {
  if(m.boundaryISO==='CHN'){chosen.push(m);continue;}
  const minimum=Math.max((counts[m.boundaryISO]||1)+1,Math.ceil((counts[m.boundaryISO]||1)*1.2));
  const candidate=levels.map(list=>list.find(row=>row.boundaryISO===m.boundaryISO)).find(row=>row&&Number(row.admUnitCount)>=minimum);
  if(candidate)chosen.push(candidate);else missing.push({iso:m.boundaryISO,name:m.boundaryName,current:counts[m.boundaryISO],minimum});
}
await writeFile(`${cache}/adm-next-metadata.json`,JSON.stringify(chosen));
await writeFile(`${cache}/adm-next-missing.json`,JSON.stringify(missing));
let index=0;
await Promise.all(Array.from({length:4},async()=>{while(index<chosen.length){const m=chosen[index++];if(m.boundaryISO==='CHN')continue;
  const folder=m.boundaryType==='ADM2'?'adm2':'adm-next';
  await download(m.simplifiedGeometryGeoJSON,`${cache}/${folder}/${m.boundaryISO}.json`);
}}));
await Promise.all([['prefecture','prefectures'],['county','counties']].map(([remote,local])=>download(
  `https://pub-480fcfcea00742058bae6bc1c86d288c.r2.dev/T2026_${remote}.gpkg`,`${cache}/chn-${local}-2026.gpkg`)));
console.log(`Cached ${chosen.length} next-level datasets; ${missing.length} keep their existing level.`);
