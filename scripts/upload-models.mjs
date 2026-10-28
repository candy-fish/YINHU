import { open, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readSecretInput } from './read-secret-input.mjs';

// Credentials are accepted only through stdin, never command arguments or files.
const { origin, token, platformToken, modelDirectory } = await readSecretInput('model upload');
const base = new URL(origin);
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('HTTPS required');
const modelDir = modelDirectory || fileURLToPath(new URL('../models/', import.meta.url));
async function retry(action, label) {
  for (let attempt = 0; ; attempt++) {
    try { return await action(); } catch (error) {
      if (error.retryable === false || attempt >= 4) throw error;
      console.log(`${label}: retry ${attempt + 1}/4`);
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}
async function call(filename, params, method, payload) {
  const url = new URL(`/api/setup/models/${filename}`, base);
  url.search = new URLSearchParams(params).toString();
  const binary = payload instanceof Uint8Array;
  return retry(async () => {
  const response = await fetch(url, { method, headers: {
    Authorization: `Bearer ${token}`,
    ...(platformToken ? { 'OAI-Sites-Authorization': `Bearer ${platformToken}` } : {}),
    'Content-Type': binary ? 'application/octet-stream' : 'application/json'
  }, body: payload ? binary ? payload : JSON.stringify(payload) : undefined });
  if (!response.ok) {
    const error = new Error(`Model ${filename}: HTTP ${response.status}`);
    error.retryable = response.status >= 500 || response.status === 429;
    await response.body?.cancel();
    throw error;
  }
  return response.json();
  }, `${filename} ${params.action}`);
}
for (const filename of ['tree.glb', 'moon.glb', 'disco.glb', 'deer_head.glb']) {
  const full = path.join(modelDir, filename);
  const size = (await stat(full)).size;
  const { uploadId } = await call(filename, { action: 'start' }, 'POST');
  const file = await open(full, 'r');
  const parts = []; const hash = createHash('sha256');
  try {
    for (let offset = 0, part = 1; offset < size; offset += 8 * 1024 * 1024, part++) {
      const buffer = Buffer.alloc(Math.min(8 * 1024 * 1024, size - offset));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
      if (bytesRead !== buffer.length) throw new Error('Incomplete model read');
      hash.update(buffer);
      parts.push(await call(filename, { action: 'part', uploadId, part: String(part) }, 'PUT', buffer));
      console.log(`${filename}: ${Math.min(offset + buffer.length, size)}/${size}`);
    }
    const completed = await call(filename, { action: 'complete', uploadId }, 'POST', { parts });
    if (completed.size !== size) throw new Error('Uploaded model size mismatch');
    const downloadedHash = await retry(async () => {
      const response = await fetch(new URL(`/models/${filename}`, base), { headers: platformToken ? { 'OAI-Sites-Authorization': `Bearer ${platformToken}` } : {} });
      if (!response.ok || !response.body) throw new Error('Cannot verify uploaded model');
      const remoteHash = createHash('sha256');
      for await (const chunk of response.body) remoteHash.update(chunk);
      return remoteHash.digest('hex');
    }, `${filename} checksum`);
    if (downloadedHash !== hash.digest('hex')) throw new Error('Uploaded model checksum mismatch');
    console.log(`${filename}: checksum verified`);
  } catch (error) {
    await call(filename, { action: 'abort', uploadId }, 'POST').catch(() => {});
    throw error;
  } finally { await file.close(); }
}
