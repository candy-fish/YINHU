const headers = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,apikey', 'Cache-Control': 'no-store' };
const present = row => row && ({ regionId: row.region_id, color: row.color, version: row.version, updatedAt: row.updated_at });
const json = (value, status = 200) => Response.json(value, { status, headers });

export function createTravelHandler({ repository, allowedKeys, regionIDs }) {
  const keys = new Set(allowedKeys), ids = new Set(regionIDs);
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!keys.has(request.headers.get('apikey'))) return json({ message: '缺少有效的站点访问凭据。' }, 401);
    try {
      const url = new URL(request.url), match = /\/api\/regions(?:\/([^/]+))?$/.exec(url.pathname);
      if (!match || url.search) return json({ message: '资源不存在。' }, 404);
      if (!match[1] && request.method === 'GET') return json((await repository.list()).map(present));
      const id = match[1] && decodeURIComponent(match[1]);
      if (!id || !ids.has(id)) return json({ message: '行政区划不存在。' }, 404);
      if (request.method !== 'PUT') return json({ message: '不支持的请求方法。' }, 405);
      const chunks = [], reader = request.body?.getReader(); let size = 0;
      if (!reader) return json({ message: '请求内容无效。' }, 400);
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 2048) { await reader.cancel(); return json({ message: '请求内容过大。' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let input;
      try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ message: '请求必须是 JSON。' }, 400); }
      if (!input || Array.isArray(input) || Object.keys(input).length !== 2 ||
        !Object.hasOwn(input, 'color') || !Object.hasOwn(input, 'version') ||
        (input.color !== null && (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/.test(input.color))) ||
        !Number.isSafeInteger(input.version) || input.version < 0 || input.version > 2147483646) {
        return json({ message: '颜色或版本号无效。' }, 400);
      }
      const saved = await repository.save(id, input.color, input.version);
      if (!saved) return json({ message: '此地区已被其他设备修改。', remote: present(await repository.get(id)) }, 409);
      return json(present(saved));
    } catch { return json({ message: '共享服务暂时不可用，请稍后重试。' }, 503); }
  };
}
