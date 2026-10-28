import { lstat, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The Sites helper uses its own source repository. Park its metadata between
// publications so the parent BlackDoor repository can track hosting as files,
// rather than accidentally adding it as an embedded Git repository/gitlink.
const hosting = fileURLToPath(new URL('../hosting/', import.meta.url));
const active = path.join(hosting, '.git');
const parked = path.join(hosting, '.sites-runtime', 'source-git');
const mode = process.argv[2];
if (!['open', 'park'].includes(mode)) throw new Error('Use sites-source.mjs open|park');
const [source, destination] = mode === 'park' ? [active, parked] : [parked, active];
const inspect = filename => lstat(filename).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
const sourceInfo = await inspect(source);
if (!sourceInfo) { console.log(`Sites source metadata already ${mode === 'park' ? 'parked' : 'open or not yet initialized'}.`); process.exit(0); }
if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) throw new Error('Unexpected Sites Git metadata; leave it untouched.');
if (await inspect(destination)) throw new Error('Both metadata locations exist; refusing to overwrite either history.');
for (const target of [source, destination]) {
  const relative = path.relative(hosting, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Metadata path must remain inside hosting');
}
await mkdir(path.dirname(destination), { recursive: true });
await rename(source, destination);
console.log(`Sites source metadata ${mode === 'park' ? 'parked' : 'opened'}; history preserved.`);
