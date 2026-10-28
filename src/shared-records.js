import { request } from './api-client.js';
import { apiURL, apiHeaders } from './api-url.js';

export function createSharedRecords(resource, { fileField, normalize }) {
  const versions = new Map();
  const files = new WeakMap();
  const imageCache = new Map();
  async function decode(row) {
    let blob = null;
    if (row.mediaId && imageCache.has(row.mediaId)) blob = imageCache.get(row.mediaId);
    else if (row.mediaId) {
      const response = await fetch(apiURL(`/api/media/${row.mediaId}/content`), { cache: 'no-store', headers: apiHeaders() });
      if (!response.ok) throw new Error('共享图片读取失败，请重试。');
      blob = new Blob([await response.arrayBuffer()], { type: row.mediaType });
      files.set(blob, { id: row.mediaId, type: row.mediaType });
      imageCache.set(row.mediaId, blob);
    }
    versions.set(row.id, row.version);
    return { ...row, [fileField]: blob };
  }
  return {
    async list() {
      const rows = await request(`/api/${resource}`);
      // Bound simultaneous image downloads instead of requesting every image at once.
      const decoded = new Array(rows.length);
      let index = 0;
      await Promise.all(Array.from({ length: Math.min(3, rows.length) }, async () => {
        while (index < rows.length) { const at = index++; decoded[at] = await decode(rows[at]); }
      }));
      const retained = new Set(rows.map(row => row.mediaId));
      for (const id of imageCache.keys()) if (!retained.has(id)) imageCache.delete(id);
      return decoded;
    },
    async put(input) {
      const values = normalize(input);
      const blob = values[fileField];
      delete values[fileField];
      let file = blob && files.get(blob);
      if (blob && !file) {
        const asset = await request('/api/media', { method: 'POST', body: {
          originalName: blob.name || `${resource}-image`, mimeType: blob.type, sizeBytes: blob.size
        } });
        const uploaded = await request(`/api/media/${asset.id}/content`, {
          method: 'PUT', body: blob, headers: { 'Content-Type': blob.type }
        });
        file = { id: uploaded.id, type: blob.type };
        files.set(blob, file);
        imageCache.set(file.id, blob);
      }
      const version = input.id && versions.get(input.id);
      if (input.id && !version) throw new Error('请重新载入共享内容后再编辑。');
      const saved = await request(`/api/${resource}${input.id ? `/${input.id}` : ''}`, {
        method: input.id ? 'PATCH' : 'POST', body: { ...values,
          mediaId: file?.id || null, mediaType: file?.type || null,
          ...(version ? { version } : {}) }
      });
      versions.set(saved.id, saved.version);
      return { ...saved, [fileField]: blob || null };
    },
    async remove(id) {
      const version = versions.get(id);
      if (!version) throw new Error('请重新载入共享内容后再删除。');
      await request(`/api/${resource}/${id}`, { method: 'DELETE', body: { version } });
      versions.delete(id);
    }
  };
}
