import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('images preview serves its shared source dependencies without blocking scene initialization', async t => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const preview = spawn(process.execPath, [fileURLToPath(new URL('../scripts/preview-images.mjs', import.meta.url)), '--port', String(port)],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (preview.exitCode !== null || preview.signalCode !== null) return;
    const closed = once(preview, 'close');
    preview.kill();
    await closed;
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Images preview did not start')), 10000);
    let output = '';
    const ready = chunk => {
      output += chunk;
      if (output.includes('Images local preview:')) { clearTimeout(timeout); resolve(); }
    };
    preview.stdout.on('data', ready);
    preview.once('error', error => { clearTimeout(timeout); reject(error); });
    preview.once('exit', code => { clearTimeout(timeout); reject(new Error(`Images preview exited: ${code}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  for (const module of ['shared-records.js', 'api-client.js', 'api-url.js', 'services/conflict-error.js']) {
    const response = await fetch(`${base}/src/${module}`);
    assert.equal(response.status, 200, module);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.equal(await response.text(), await readFile(new URL(`../src/${module}`, import.meta.url), 'utf8'));
    const head = await fetch(`${base}/src/${module}`, { method: 'HEAD' });
    assert.equal(head.status, 200, module);
    assert.equal(await head.text(), '');
  }
  const page = await fetch(`${base}/transition/images/images.html`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /src="images.js"/);
  const outside = await fetch(`${base}/src/%2e%2e%2f%2e%2e%2fpackage.json`);
  assert.equal(outside.status, 403);
});
