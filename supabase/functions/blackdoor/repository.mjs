// This module runs only in the Edge Function. Never import it into browser code.
export function createRepository({ url, serviceKey, fetcher = fetch }) {
  const headers = { apikey: serviceKey, ...(serviceKey?.startsWith('eyJ') ? { Authorization: `Bearer ${serviceKey}` } : {}) };
  async function rest(path, options = {}) {
    const response = await fetcher(`${url}/rest/v1/${path}`, { ...options,
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation', ...options.headers }
    });
    const value = await response.json();
    if (!response.ok) {
      const error = new Error('共享数据库请求失败。');
      error.status = value.code === '23505' ? 409 : 503;
      throw error;
    }
    return value;
  }
  const filter = (resource, id) => `blackdoor_records?resource=eq.${encodeURIComponent(resource)}${id ? `&id=eq.${id}` : ''}`;
  return {
    async list(resource, includeDeleted = false) {
      const result = [];
      for (let offset = 0; ; offset += 500) {
        const page = await rest(`${filter(resource)}${includeDeleted ? '' : '&deleted_at=is.null'}&order=created_at.asc,id.asc&limit=500&offset=${offset}`);
        result.push(...page);
        if (page.length < 500) return result;
      }
    },
    async get(resource, id) { return (await rest(filter(resource, id)))[0] || null; },
    async insert(resource, data) { return (await rest('blackdoor_records', {
      method: 'POST', body: JSON.stringify({ resource, data })
    }))[0]; },
    async update(resource, id, version, data, deleted_at = null) {
      return (await rest(`${filter(resource, id)}&version=eq.${version}`, {
        method: 'PATCH', body: JSON.stringify({ data, deleted_at, version: version + 1, updated_at: new Date().toISOString() })
      }))[0] || null;
    },
    counter: id => rest('rpc/blackdoor_increment', { method: 'POST', body: JSON.stringify({ operation_id: id || null }) }),
    async upload(id, bytes, type) {
      const response = await fetcher(`${url}/storage/v1/object/blackdoor-media/${id}`, {
        method: 'POST', headers: { ...headers, 'Content-Type': type, 'x-upsert': 'true' }, body: bytes
      });
      if (!response.ok) throw new Error('共享图片上传失败。');
    },
    async signedURL(id) {
      const response = await fetcher(`${url}/storage/v1/object/sign/blackdoor-media/${id}`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 })
      });
      if (!response.ok) throw new Error('无法读取共享文件地址。');
      const result = await response.json();
      const signed = result.signedURL || result.signedUrl;
      if (typeof signed !== 'string' || !signed.startsWith('/object/sign/blackdoor-media/')) throw new Error('共享文件地址无效。');
      return url + '/storage/v1' + signed;
    },
    async download(id) {
      return fetcher(`${url}/storage/v1/object/authenticated/blackdoor-media/${id}`, { headers });
    }
  };
}

