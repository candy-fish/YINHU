import { spawnSync } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root,'node_modules/@gltf-transform/cli/bin/cli.js');
const original = path.join(root,'models/tree.glb');
const pruned = path.join(root,'.cache/tree-pruned.glb');
const optimized = path.join(root,'models/tree-optimized.glb');
await mkdir(path.dirname(pruned),{recursive:true});
function run(args) {
  const result = spawnSync(process.execPath,[cli,...args],{cwd:root,stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
// Keep every triangle and original texture image. Remove unused UV sets and
// encode high-precision geometry; the original GLB remains untouched.
run(['prune',original,pruned,'--keep-solid-textures','true']);
run(['meshopt',pruned,optimized,'--level','high','--quantize-position','16',
  '--quantize-normal','12','--quantize-texcoord','16','--quantization-volume','scene']);
const [before,after] = await Promise.all([stat(original),stat(optimized)]);
if (after.size > 50 * 1024 * 1024) throw new Error('Optimized tree exceeds the static asset size limit.');
console.log(`Tree: ${before.size} → ${after.size} bytes (${(100-after.size/before.size*100).toFixed(1)}% smaller).`);
