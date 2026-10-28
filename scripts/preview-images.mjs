import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

// Live images source with a bounded built-site fallback for the return link.
// Shared APIs stay in the existing preview Worker on loopback port 4174.
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const imageRoot = path.join(root, 'transition/images');
const fontRoot = path.join(root, 'node_modules/@fontsource');
const builtRoot = path.join(root, 'dist');
const index = process.argv.indexOf('--port');
const port = index < 0 ? 4175 : Number(process.argv[index + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid preview port');
const types = { '.html': 'text/html; charset=utf-8', '.fragment': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg' };

function proxyApi(request, response, url) {
  return new Promise(resolve => {
    const upstream = http.request({ hostname: '127.0.0.1', port: 4174, path: url.pathname + url.search,
      method: request.method, headers: { ...request.headers, host: '127.0.0.1:4174' } }, result => {
      response.writeHead(result.statusCode, result.headers);
      pipeline(result, response).catch(() => {}).finally(resolve);
    });
    upstream.setTimeout(30000, () => upstream.destroy(new Error('Shared preview timed out')));
    upstream.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'Start npm run preview for the shared local API.' }));
      } else response.destroy();
      resolve();
    });
    request.on('aborted', () => upstream.destroy());
    request.on('error', error => upstream.destroy(error));
    request.pipe(upstream);
    response.on('close', () => { if (!response.writableFinished) upstream.destroy(); });
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) { await proxyApi(request, response, url); return; }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    if (url.pathname === '/') { response.writeHead(302, { Location: '/transition/images/images.html' }).end(); return; }
    if (url.pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    if (url.pathname === '/vendor/fonts/fonts.css') {
      response.writeHead(200, { 'Content-Type': types['.css'] });
      response.end('@import url("/vendor/fonts/noto-serif-sc/400.css");@import url("/vendor/fonts/space-grotesk/400.css");'); return;
    }
    const fonts = url.pathname.startsWith('/vendor/fonts/');
    const images = url.pathname.startsWith('/transition/images/');
    const sourceModule = url.pathname.startsWith('/src/');
    const directory = sourceModule ? root : fonts ? fontRoot : images ? imageRoot : builtRoot;
    const relative = decodeURIComponent(fonts ? url.pathname.slice('/vendor/fonts/'.length)
      : images ? url.pathname.slice('/transition/images/'.length) : '.' + url.pathname);
    let file = path.resolve(directory, relative);
    if (!file.startsWith(directory + path.sep)) { response.writeHead(403).end(); return; }
    let info;
    try { info = await stat(file); }
    catch (error) {
      // The built transition also uses flattened font URLs; source CSS keeps its package URLs.
      if (!fonts || !['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
      file = path.resolve(builtRoot, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(builtRoot + path.sep)) { response.writeHead(403).end(); return; }
      info = await stat(file);
    }
    if (!info.isFile()) { response.writeHead(404).end(); return; }
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Content-Length': info.size, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    let range;
    if (request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      const start = match?.[1] ? Number(match[1]) : Math.max(0, info.size - Number(match?.[2]));
      const end = match?.[1] && match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
        || start < 0 || start > end || start >= info.size) {
        response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return;
      }
      range = { start, end };
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      headers['Content-Length'] = end - start + 1;
    }
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === 'HEAD') response.end(); else await pipeline(createReadStream(file, range), response);
  } catch (error) {
    if (!response.headersSent) response.writeHead(error instanceof URIError ? 400 : ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500);
    response.end();
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Images local preview: http://127.0.0.1:${port}/transition/images/images.html`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
