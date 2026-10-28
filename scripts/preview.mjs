import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Miniflare } from '../hosting/node_modules/miniflare/dist/src/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = path.join(root, 'dist');
const portIndex = process.argv.indexOf('--port');
const port = portIndex < 0 ? 4174 : Number(process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid preview port');
const api = await readFile(path.join(root, 'hosting/lib/blackdoor-api.mjs'), 'utf8');
const runtime = new Miniflare({
  modules: [
    { type: 'ESModule', path: 'index.mjs', contents: 'import {handleBlackDoor} from "./api.mjs"; export default {fetch(request,env){return handleBlackDoor(request,env)}};' },
    { type: 'ESModule', path: 'api.mjs', contents: api }
  ],
  compatibilityDate: '2026-05-15', cf: false,
  d1Databases: ['DB'], d1Persist: path.join(root, '.cache/shared-preview/d1'),
  r2Buckets: ['BUCKET'], r2Persist: path.join(root, '.cache/shared-preview/r2')
});
const db = await runtime.getD1Database('DB');
await db.prepare('CREATE TABLE IF NOT EXISTS preview_migrations (name TEXT PRIMARY KEY)').run();
const migrations = path.join(root, 'hosting/drizzle');
for (const name of (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort()) {
  if (await db.prepare('SELECT name FROM preview_migrations WHERE name=?').bind(name).first()) continue;
  const sql = await readFile(path.join(migrations, name), 'utf8');
  const statements = sql.split('--> statement-breakpoint').filter(statement => statement.trim()).map(statement => db.prepare(statement.trim()));
  await db.batch([...statements, db.prepare('INSERT INTO preview_migrations(name) VALUES (?)').bind(name)]);
}

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg' };

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 1024 * 1024) { response.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const result = await runtime.dispatchFetch(url.href, { method: request.method, headers: request.headers,
        ...(!['GET', 'HEAD'].includes(request.method) ? { body: Buffer.concat(chunks) } : {}) });
      response.writeHead(result.status, Object.fromEntries(result.headers));
      if (result.body) await pipeline(Readable.fromWeb(result.body), response);
      else response.end();
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(assets, '.' + relative);
    if (!file.startsWith(assets + path.sep)) { response.writeHead(403).end(); return; }
    const info = await stat(file);
    if (!info.isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Content-Length': info.size, 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else await pipeline(createReadStream(file), response);
  } catch (error) {
    if (!response.headersSent) response.writeHead(error.code === 'ENOENT' ? 404 : 500);
    response.end();
  }
});

server.on('error', async error => { console.error(error.message); await runtime.dispose(); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Shared local preview: http://127.0.0.1:${port}/transition/transition.html`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close(async () => { await runtime.dispose(); process.exit(0); });
});
