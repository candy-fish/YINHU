import { spawnSync } from 'node:child_process';
import { cp, mkdir, lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowedRoots = new Set(['.github', 'art', 'cover', 'main', 'models', 'scripts', 'src', 'supabase', 'tests', 'transition']);
const allowedFiles = new Set(['.gitignore', 'README.md', 'DEPLOY-GITHUB.md', 'package.json', 'package-lock.json', 'deployment.public.json']);
export function publishable(relative) {
  const parts = relative.replaceAll('\\', '/').split('/');
  const name = parts.at(-1);
  if (!allowedRoots.has(parts[0]) && !allowedFiles.has(relative)) return false;
  if (parts.some(p => ['.git', '.cache', 'node_modules', '.wrangler', '.sites-runtime', 'dist', 'coverage', '.auth',
    '.codex', '.agents', 'browser-data', 'browser-profile', 'backups', 'exports', '.temp', '.branches'].includes(p))) return false;
  if (/^(?:\.env|\.dev\.vars)(?:$|\.)|cookie|storage[-_]?state|credentials/i.test(name)) return false;
  if (/\.(?:sqlite(?:-wal|-shm)?|sqlite3|db|har|log|pem|key|blend\d+|tmp|temp|tar|zip)$/i.test(name)) return false;
  return relative !== 'models/tree.glb';
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = path.join(root, '.cache', 'github-publish-' + Date.now());
  await mkdir(output, { recursive: true });
  const listed = spawnSync('git', ['-c', 'core.quotepath=false', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root });
  if (listed.status !== 0) throw new Error('Could not enumerate source files.');
  const selected = [...new Set(listed.stdout.toString('utf8').split('\0').filter(Boolean))].filter(publishable);
  let count = 0, bytes = 0;
  for (const relative of selected) {
    const full = path.join(root, relative);
    const info = await lstat(full).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (!info) continue; // Honor deletions in the working tree.
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unexpected source type: ' + relative);
    if (info.size > 100 * 1024 * 1024) throw new Error('GitHub file limit exceeded: ' + relative);
    if (/\.(?:js|mjs|ts|tsx|json|yml|yaml|md|toml|sql|html|css)$/.test(relative) && info.size < 10 * 1024 * 1024) {
      const content = await readFile(full, 'utf8');
      if (/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sb_secret_[A-Za-z0-9_-]{15,})\b/.test(content)) throw new Error('Potential credential in ' + relative);
    }
    await mkdir(path.dirname(path.join(output, relative)), { recursive: true });
    await cp(full, path.join(output, relative)); count++; bytes += info.size;
  }
  // This is a new snapshot, deliberately containing no old Git history or local runtime state.
  await writeFile(path.join(output, '.gitignore'), (await readFile(path.join(root, '.gitignore'), 'utf8')) + '\nmodels/tree.glb\n');
  console.log(JSON.stringify({ output, files: count, bytes, excludesBrowserData: true, includesGitHistory: false }));
}
