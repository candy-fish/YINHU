import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const base = process.env.BLACKDOOR_BASE_PATH || '/YINHU/';
if (!/^\/(?:[A-Za-z0-9._-]+\/)*$/.test(base)) throw new Error('BLACKDOOR_BASE_PATH must be / or /repository/.');
const publicConfig = JSON.parse(await readFile(path.join(root, 'deployment.public.json'), 'utf8').catch(() => '{}'));
const rawAPI = process.env.BLACKDOOR_API_BASE || publicConfig.apiBase || '';
const publicApiKey = process.env.BLACKDOOR_PUBLIC_API_KEY || publicConfig.publicApiKey || '';
if (publicApiKey && !publicApiKey.startsWith('sb_publishable_')) throw new Error('Only publishable keys may be embedded in Pages.');
const preview = process.argv.includes('--preview');
let apiBase = '';
if (rawAPI) {
  const parsed = new URL(rawAPI);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Use a public HTTPS API URL without credentials.');
  apiBase = parsed.href.replace(/\/$/, '');
} else if (!preview) throw new Error('Set BLACKDOOR_API_BASE to the deployed Supabase function URL before publishing.');
const result = spawnSync(process.execPath, ['scripts/build.mjs', '--pages'], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);

// Only packaged artwork and models are copied. Local browsers and databases are never read.
for (const name of ['moon.glb', 'disco.glb', 'deer_head.glb', 'tree-optimized.glb']) {
  await cp(path.join(root, 'models', name), path.join(dist, 'models', name));
}
async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full)); else result.push(full);
  }
  return result;
}
const bootstrap = '<script src="/assets/site-config.js"></script>';
for (const full of await walk(dist)) {
  if (!/\.(html|js|css|fragment)$/.test(full)) continue;
  let source = await readFile(full, 'utf8');
  if (full.endsWith('.html')) source = source.replace('<head>', '<head>\n' + bootstrap);
  // Cover/index.html is also copied to the root. Its parent-relative link needs adjustment there.
  if (full === path.join(dist, 'index.html')) source = source.replaceAll('../transition/', './transition/');
  // Rewrite only site-owned root URLs; API paths remain relative to their backend.
  source = source.replace(/(["'\x60(])\/(?=(?:assets|vendor|models|transition|main|cover)\/)/g, '$1' + base);
  if (full === path.join(dist, 'transition/images/images.html')) {
    // Pages caches stable asset URLs. Change the entry URL when its code changes
    // so visitors do not keep the old inlined renderer after a deployment.
    const entry = await readFile(path.join(dist, 'transition/images/images.js'));
    const version = createHash('sha256').update(entry).digest('hex').slice(0, 12);
    source = source.replace('src="images.js"', `src="images.js?v=${version}"`);
  }
  await writeFile(full, source);
}
const manifestPath = path.join(dist, 'assets/asset-manifest.js');
let manifest = await readFile(manifestPath, 'utf8');
const match = /^globalThis\.BLACKDOOR_ASSETS=(.*);\s*$/s.exec(manifest);
const assets = JSON.parse(match[1]);
assets.models.tree = base + 'models/tree-optimized.glb';
await writeFile(manifestPath, 'globalThis.BLACKDOOR_ASSETS=' + JSON.stringify(assets) + ';\n');
await writeFile(path.join(dist, 'assets/site-config.js'), 'globalThis.BLACKDOOR_CONFIG=' + JSON.stringify({
  shared: true, apiBase, publicApiKey, basePath: base, localImports: false, preview
}) + ';\n');
await writeFile(path.join(dist, '.nojekyll'), '');
const checked = spawnSync(process.execPath, ['scripts/check-pages.mjs'], { cwd: root, stdio: 'inherit' });
if (checked.status !== 0) process.exit(checked.status || 1);
console.log('GitHub Pages build ready at ' + base + (preview ? ' (preview only; backend not verified)' : ''));
