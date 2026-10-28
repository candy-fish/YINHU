import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchTreeModelParts } from '../transition/mind/tree-model-loader.js';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'dist');
const runtime=await readFile(path.join(dist,'assets/site-config.js'),'utf8');
const config=JSON.parse(runtime.match(/^globalThis.BLACKDOOR_CONFIG=(.*);/s)[1]);
const base=config.basePath;
async function walk(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);out.push(...entry.isDirectory()?await walk(file):[file]);}return out;}
const files=await walk(dist);
const imagesEntry=await readFile(path.join(dist,'transition/images/images.js'),'utf8');
assert.match(imagesEntry,/import\(["']\.\/assets\/companions-3d\.bundle\.js["']\)/,
 'Images must load the 3D renderer from assets/ to preserve model and texture URLs.');
assert.ok(!imagesEntry.includes('hologram-code.png')&&!imagesEntry.includes('aurora-curtains.glb'),
 'The 3D renderer was inlined into images.js, changing import.meta.url.');
const rendererPath='transition/images/assets/companions-3d.bundle.js';
const renderer=await readFile(path.join(dist,rendererPath),'utf8');
const rendererURL=new URL(base+rendererPath,'https://pages.test');
for(const name of ['hologram-code.png','fish-surface.png','deer-companion.glb','fish-companion.glb','aurora-curtains.glb']){
 const url=new URL('./'+name,rendererURL);
 assert.ok(url.pathname.startsWith(base),'3D asset escaped Pages subdirectory: '+url.pathname);
 assert.ok((await stat(path.join(dist,url.pathname.slice(base.length)))).size>0,'Missing images 3D asset: '+name);
}
assert.ok(renderer.includes('import.meta.url'),'3D assets must remain relative to their renderer module.');
for(const file of files){
 assert.ok((await stat(file)).size<=100*1024*1024,'Oversized Pages file: '+file);
 assert.ok(!/\.(?:sqlite|db|har|pem|key)$/i.test(file),'Private runtime file in build');
 if(!file.endsWith('.html'))continue;
 const html=await readFile(file,'utf8');
 assert.ok(html.includes(base+'assets/site-config.js'),'Missing public runtime configuration: '+file);
 for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
   if(/^(?:https?:|data:|#|mailto:)/.test(match[1]))continue;
   const relative=path.relative(dist,file).replaceAll('\\','/');
   const url=new URL(match[1],'https://pages.test'+base+relative);
   assert.ok(url.pathname.startsWith(base),'Root URL escaped Pages subdirectory: '+url.pathname);
   const target=path.join(dist,decodeURIComponent(url.pathname.slice(base.length)));
   await stat(target).catch(()=>{throw Error('Missing linked Pages asset: '+target);});
 }
}
const source=await readFile(path.join(dist,'assets/asset-manifest.js'),'utf8');
const manifest=JSON.parse(source.match(/^globalThis.BLACKDOOR_ASSETS=(.*);/s)[1]);
const decoded=await fetchTreeModelParts(manifest.treeModel,()=>{},async url=>{
 assert.ok(url.startsWith(base));
 return new Response(await readFile(path.join(dist,url.slice(base.length))));
});
assert.equal(decoded.byteLength,manifest.treeModel.byteLength);
console.log('Pages subdirectory, linked assets, model parts and privacy checks passed: '+files.length+' files.');
