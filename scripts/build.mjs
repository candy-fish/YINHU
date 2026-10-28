import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const root = process.cwd();
const out = path.join(root, 'dist');
const deployBuild = process.argv.includes('--deploy') || process.argv.includes('--pages');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

async function copyTree(sourceRelative, targetRelative = sourceRelative) {
  const source = path.join(root, sourceRelative);
  const target = path.join(out, targetRelative);
  await cp(source, target, {
    recursive: true,
    filter(sourcePath) {
      const relative = path.relative(root, sourcePath).replaceAll('\\', '/');
      return !relative.startsWith('transition/mind/mindbuild');
    }
  });
}

await Promise.all([
  copyTree('cover'),
  copyTree('main'),
  copyTree('transition')
]);

await cp(path.join(root, 'cover', 'index.html'), path.join(out, 'index.html'));
await cp(path.join(root, 'cover', 'cover.css'), path.join(out, 'cover.css'));

const modelsOut = path.join(out, 'models');
await mkdir(modelsOut, { recursive: true });
const modelFiles = await readdir(path.join(root, 'models'));
const modelManifest = {};
let treeModel;
for (const filename of modelFiles) {
  if (!filename.toLowerCase().endsWith('.glb')) continue;
  if (filename === 'tree-optimized.glb') continue;
  const source = path.join(root, 'models', filename);
  const key = path.basename(filename, '.glb');
  if (!deployBuild) {
    await cp(source, path.join(modelsOut, filename));
  }
  modelManifest[key === 'deer_head' ? 'deerHead' : key] = `/models/${filename}`;
}
if (modelFiles.includes('tree-optimized.glb')) {
  const model = await readFile(path.join(root, 'models/tree-optimized.glb'));
  const hash = createHash('sha256').update(model).digest('hex').slice(0, 12);
  const directory = path.join(out, 'assets/models');
  await mkdir(directory, { recursive: true });
  const parts = [];
  const partSize = 6 * 1024 * 1024;
  for (let offset = 0; offset < model.length; offset += partSize) {
    const data = model.subarray(offset, Math.min(offset + partSize, model.length));
    const filename = `tree-${hash}-part-${parts.length + 1}.bin`;
    await writeFile(path.join(directory, filename), data);
    parts.push({ url: `/assets/models/${filename}`, byteLength: data.length,
      integrity: `sha256-${createHash('sha256').update(data).digest('base64')}` });
  }
  treeModel = { version: hash, byteLength: model.length, parts };
  const mindHtml = path.join(out, 'transition/mind/mind.html');
  const html = await readFile(mindHtml, 'utf8');
  await writeFile(mindHtml, html.replace('<!-- mind-model-preload -->',
    `<link rel="preload" as="fetch" href="${parts[0].url}" integrity="${parts[0].integrity}" crossorigin="anonymous">`));
}

const vendor = path.join(out, 'vendor');
await mkdir(path.join(vendor, 'three-r128'), { recursive: true });
await mkdir(path.join(vendor, 'p5'), { recursive: true });
await cp(path.join(root, 'node_modules', 'three-legacy', 'build', 'three.min.js'), path.join(vendor, 'three-r128', 'three.min.js'));
await cp(path.join(root, 'node_modules', 'three-legacy', 'examples', 'js', 'loaders', 'GLTFLoader.js'), path.join(vendor, 'three-r128', 'GLTFLoader.js'));
const p5Source = await readFile(path.join(root, 'node_modules', 'p5', 'lib', 'p5.min.js'), 'utf8');
await writeFile(
  path.join(vendor, 'p5', 'p5.min.js'),
  p5Source.replace('https://cdn.jsdelivr.net/npm/p5/translations/', '/vendor/p5/translations/')
);
await cp(
  path.join(root, 'node_modules', 'p5', 'translations'),
  path.join(vendor, 'p5', 'translations'),
  { recursive: true }
);

const fontRoot = path.join(vendor, 'fonts');
await mkdir(fontRoot, { recursive: true });
const simpleFonts = [
  ['cinzel', ['400', '500']],
  ['space-grotesk', ['400', '700']]
];
let fontCss = '';
for (const [family, weights] of simpleFonts) {
  const familyDir = path.join(fontRoot, family);
  await mkdir(familyDir, { recursive: true });
  for (const weight of weights) {
    const filename = `${family}-latin-${weight}-normal.woff2`;
    await cp(path.join(root, 'node_modules', '@fontsource', family, 'files', filename), path.join(familyDir, filename));
    const displayName = family === 'cinzel' ? 'Cinzel' : 'Space Grotesk';
    fontCss += `@font-face{font-family:"${displayName}";font-style:normal;font-display:swap;font-weight:${weight};src:url("./${family}/${filename}") format("woff2")}\n`;
  }
}

const notoSource = path.join(root, 'node_modules', '@fontsource', 'noto-serif-sc');
const notoTarget = path.join(fontRoot, 'noto-serif-sc');
await mkdir(path.join(notoTarget, 'files'), { recursive: true });
for (const weight of ['400', '700']) {
  await cp(path.join(notoSource, `${weight}.css`), path.join(notoTarget, `${weight}.css`));
}
for (const filename of await readdir(path.join(notoSource, 'files'))) {
  if (/-(400|700)-normal\.woff2$/.test(filename)) {
    await cp(path.join(notoSource, 'files', filename), path.join(notoTarget, 'files', filename));
  }
}
fontCss += '@import url("./noto-serif-sc/400.css");\n@import url("./noto-serif-sc/700.css");\n';
await writeFile(path.join(fontRoot, 'fonts.css'), fontCss);

const assets = path.join(out, 'assets');
await mkdir(assets, { recursive: true });
await cp(path.join(root, 'src', 'layout.css'), path.join(assets, 'layout.css'));
await writeFile(path.join(assets, 'asset-manifest.js'),
  `globalThis.BLACKDOOR_ASSETS=${JSON.stringify({ models: modelManifest, ...(treeModel ? {treeModel} : {}) })};\n`);
await writeFile(path.join(out, '_headers'),
  '/assets/models/*\n  Cache-Control: public, max-age=31536000, immutable\n/assets/asset-manifest.js\n  Cache-Control: no-cache\n');

await build({
  entryPoints: {
    bootstrap: path.join(root, 'src', 'bootstrap.js')
  },
  outdir: assets,
  bundle: true,
  splitting: true,
  format: 'esm',
  target: 'es2022',
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  minify: deployBuild,
  sourcemap: deployBuild ? false : 'linked'
});

await build({
  entryPoints: [path.join(root, 'transition', 'mind', 'mind.js')],
  outfile: path.join(out, 'transition', 'mind', 'mind.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: deployBuild,
  sourcemap: deployBuild ? false : 'linked'
});

await build({
  entryPoints: [path.join(root, 'transition', 'mind', 'mind-bvh-worker.js')],
  outfile: path.join(out, 'transition', 'mind', 'mind-bvh-worker.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: deployBuild,
  sourcemap: deployBuild ? false : 'linked'
});

await build({
  entryPoints: [path.join(root, 'transition', 'images', 'companions-3d.js')],
  outfile: path.join(out, 'transition', 'images', 'assets', 'companions-3d.bundle.js'),
  bundle: true, format: 'esm', target: 'es2022', minify: true
});

console.log(`BlackDoor ${deployBuild ? 'deployment' : 'local'} build written to ${out}`);

await build({ entryPoints: [path.join(root, 'transition/images/images.js')], outfile: path.join(out, 'transition/images/images.js'), bundle: true, format: 'esm', target: 'es2022', minify: deployBuild });
