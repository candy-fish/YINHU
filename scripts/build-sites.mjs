import { spawnSync } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const hosting = path.join(root, 'hosting');
function run(script, args = [], cwd = root) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(path.join(root, 'scripts/build.mjs'), ['--deploy']);
run(path.join(root, 'scripts/check-build.mjs'), ['--deploy']);
const publicDir = path.join(hosting, 'public');
if (path.resolve(publicDir) !== path.resolve(root, 'hosting', 'public')) throw new Error('Invalid asset output directory');
await rm(publicDir, { recursive: true, force: true });
await cp(path.join(root, 'dist'), publicDir, { recursive: true });
run(path.join(hosting, 'scripts/run-framework.mjs'), ['build'], hosting);
