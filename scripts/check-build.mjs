import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const dist = path.join(root, 'dist');
const required = [
  'index.html',
  'assets/bootstrap.js',
  'assets/asset-manifest.js',
  'transition/transition.html',
  'transition/images-entry.css',
  'transition/images-entry.js',
  'transition/images-journey.css',
  'transition/images-journey.js',
  'transition/sidebar.css',
  'transition/sidebar.js',
  'transition/counter/counter.html',
  'transition/counter/counter.css',
  'transition/counter/counter.js',
  'transition/counter/loading.js',
  'transition/counter/music.js',
  'transition/counter/assets/ancient-egypt-theme.mp3',
  'transition/counter/assets/reading-mascot.webp',
  'transition/counter/cards.js',
  'transition/counter/effects.js',
  'transition/counter/mist.js',
  'transition/counter/state.js',
  'transition/counter/assets/golden-egypt-background.png',
  'transition/counter/assets/life-scepter-card.png',
  'transition/counter/assets/twin-dragon-card.png',
  'transition/counter/assets/happiness-card.png',
  'transition/counter/assets/wife-discontent-card.png',
  'transition/calendar/calendar.fragment',
  'transition/mind/mind.html',
  'transition/mind/mind.css',
  'transition/mind/images/mind-portrait.png',
  'transition/mind/images/mind-portrait-soft.png',
  'transition/mind/images/ancient-erdtree-sigil.png',
  'transition/mind/images/ancient-erdtree-sigil-aged.png',
  'transition/mind/mind.js',
  'transition/mind/mind-bvh-worker.js',
  'transition/images/images.html',
  'transition/images/images-arrival.css',
  'transition/images/images-arrival.js',
  'transition/images/images.css',
  'transition/images/images.js',
  'transition/images/assets/companions-3d.bundle.js',
  'transition/images/assets/aurora-curtains.glb',
  'transition/images/assets/deer-companion.glb',
  'transition/images/assets/fish-companion.glb',
  'vendor/three-r128/three.min.js',
  'vendor/p5/p5.min.js'
];

for (const file of required) await access(path.join(dist, file));

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const builtFiles = await walk(dist);
const staticModels = new Set([
  'transition/images/assets/aurora-curtains.glb',
  'transition/images/assets/deer-companion.glb',
  'transition/images/assets/fish-companion.glb'
]);
if (process.argv.includes('--deploy') && builtFiles.some(file =>
  /\.glb$/i.test(file) && !staticModels.has(path.relative(dist, file).replaceAll('\\', '/')))) {
  throw new Error('Sites 发布包仅允许映相的小型 GLB 和轻量树缓存分片；原始大型 GLB 必须由 R2 提供。');
}
const manifest = await readFile(path.join(dist, 'assets/asset-manifest.js'), 'utf8');
const treeModel = JSON.parse(manifest.match(/^globalThis\.BLACKDOOR_ASSETS=(.*);\s*$/s)[1]).treeModel;
if (process.argv.includes('--deploy') && !treeModel?.parts?.length) throw new Error('发布包缺少轻量树模型分片。');
if (treeModel) {
  let size = 0;
  for (const part of treeModel.parts) {
    const data = await readFile(path.join(dist, part.url.slice(1)));
    if (data.length !== part.byteLength || `sha256-${createHash('sha256').update(data).digest('base64')}` !== part.integrity) {
      throw new Error('轻量树模型分片校验失败。');
    }
    size += data.length;
  }
  if (size !== treeModel.byteLength) throw new Error('轻量树模型分片总大小不一致。');
}
const sourceLike = builtFiles.filter(file => /\.(html|css|js)$/.test(file));
const forbiddenRuntimeHosts = /fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|esm\.sh/;
for (const file of sourceLike) {
  const content = await readFile(file, 'utf8');
  if (forbiddenRuntimeHosts.test(content)) {
    throw new Error(`部署产物仍依赖境外运行时资源：${path.relative(dist, file)}`);
  }
  if (/cloudbase|auth-pending|auth-guard|runtime-config/i.test(content)) {
    throw new Error(`部署产物残留旧云服务或登录依赖：${path.relative(dist, file)}`);
  }
}

const oversizedStaticFiles = [];
for (const file of builtFiles) {
  const size = (await stat(file)).size;
  if (size > 25 * 1024 * 1024) oversizedStaticFiles.push(path.relative(dist, file));
}

if (oversizedStaticFiles.length) {
  if (process.argv.includes('--deploy')) throw new Error(`发布包含有大型静态资源：${oversizedStaticFiles.join(', ')}`);
  console.warn(`本地构建包含大型资源（Sites 部署使用 R2）：${oversizedStaticFiles.join(', ')}`);
}

console.log(`Build check passed: ${builtFiles.length} files.`);
