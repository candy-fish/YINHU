import { request } from '../api-client.js';

export const storageAdapter = Object.freeze({
  async upload(objectKey, file) {
    return request(`/api/media/${encodeURIComponent(objectKey)}/content`, {
      method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' }
    });
  },
  async signedUrl(objectKey) {
    // Compatibility name: this release uses public, same-origin media access.
    const value = await request(`/api/media/${encodeURIComponent(objectKey)}/url`);
    return value.url;
  }
});
export const mediaService = Object.freeze({
  async upload(file) {
    const asset = await request('/api/media', { method: 'POST', body: {
      originalName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size
    } });
    return storageAdapter.upload(asset.id, file);
  },
  async getTemporaryUrl(asset) {
    if (!asset || asset.status !== 'ready' || asset.deleted_at) throw new Error('媒体当前不可访问。');
    return storageAdapter.signedUrl(asset.id);
  },
  softDelete: ({ id, version }) => request(`/api/media/${id}`, { method: 'DELETE', body: { version } }),
  restore: ({ id, version }) => request(`/api/media/${id}/restore`, { method: 'POST', body: { version } })
});
