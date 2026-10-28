const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const calendarTypes = ['day-notes', 'anniversaries', 'journals'];
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const sharedFields = { 'day-notes': { noteDate: 'note_date', content: 'content' },
  anniversaries: { eventDate: 'event_date', title: 'title', description: 'description' },
  journals: { periodKey: 'period_key', startDate: 'start_date', endDate: 'end_date', content: 'content' } };
function problem(message, status = 400, remote) { throw Object.assign(new Error(message), { status, remote }); }
const text = (value, max, optional = false) => typeof value === 'string' && value.length <= max && (optional || value.trim().length > 0);
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function fields(resource, input, previous = {}) {
  const allowed = resource === 'thoughts' ? ['name', 'description', 'position', 'equipped', 'mediaId', 'mediaType'] :
    resource === 'windows' ? ['title', 'date', 'dateEnd', 'material', 'frame', 'mediaId', 'mediaType'] :
    Object.keys(sharedFields[resource] || {});
  if (Object.keys(input).some(key => ![...allowed, 'id', 'version'].includes(key))) problem('请求包含不支持的字段。');
  const data = { ...previous };
  for (const key of allowed) if (Object.hasOwn(input, key)) data[sharedFields[resource]?.[key] || key] = input[key];
  if (resource === 'day-notes' && (!validDate(data.note_date) || !text(data.content, 100000))) problem('笔记日期或内容无效。');
  if (resource === 'anniversaries') {
    data.description ??= '';
    if (!validDate(data.event_date) || !text(data.title, 1000) || !text(data.description, 100000, true)) problem('纪念日内容无效。');
  }
  if (resource === 'journals') {
    data.end_date ??= null;
    if (!validDate(data.start_date) || (data.end_date !== null && (!validDate(data.end_date) || data.end_date <= data.start_date)) ||
      data.period_key !== (data.end_date ? `${data.start_date}~${data.end_date}` : data.start_date) || !text(data.content, 100000)) problem('手记区间或内容无效。');
  }
  if (resource === 'thoughts') {
    data.description ??= ''; data.equipped ??= false;
    if (!text(data.name, 1000) || !text(data.description, 100000, true) || typeof data.equipped !== 'boolean' ||
      !data.position || !['x', 'y', 'z'].every(axis => typeof data.position[axis] === 'number' && Number.isFinite(data.position[axis]) && Math.abs(data.position[axis]) <= 1e6)) problem('思维名称、坐标或装备状态无效。');
  }
  if (resource === 'windows') {
    data.dateEnd ??= ''; data.material ??= '';
    const f = data.frame;
    if (!text(data.title, 80) || [...data.title].length > 40 || !validDate(data.date) ||
      (data.dateEnd && (!validDate(data.dateEnd) || data.dateEnd < data.date)) || !text(data.material, 1200, true) || [...data.material].length > 600 ||
      !f || !['width', 'height', 'y'].every(key => typeof f[key] === 'number' && Number.isFinite(f[key])) ||
      f.width < 80 || f.width > 640 || f.height < 64 || f.height > 440 || f.y < 40 || f.y + f.height > 520) problem('窗口名称、日期或尺寸无效。');
  }
  if (['thoughts', 'windows'].includes(resource)) {
    data.mediaId ??= null; data.mediaType ??= null;
    if (data.mediaId !== null && (!UUID.test(data.mediaId) || !imageTypes.has(data.mediaType))) problem('共享图片编号无效。');
    if (data.mediaId === null && data.mediaType !== null) problem('共享图片类型无效。');
  }
  return data;
}
function present(row) {
  const base = { ...row.data, id: row.id, version: row.version };
  if (['thoughts', 'windows'].includes(row.resource)) return { ...base, createdAt: Date.parse(row.created_at) };
  return { ...base, workspace_id: '00000000-0000-4000-8000-000000000001', created_at: row.created_at,
    updated_at: row.updated_at, deleted_at: row.deleted_at, created_by: 'shared', updated_by: 'shared' };
}
async function readBytes(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); problem('请求内容过大。', 413); }
    chunks.push(value);
  }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  return data;
}
async function body(request) {
  let value;
  try { value = JSON.parse(new TextDecoder().decode(await readBytes(request, 1024 * 1024))); }
  catch (error) { if (error.status) throw error; problem('请求必须是 JSON。'); }
  if (!value || Array.isArray(value) || typeof value !== 'object') problem('请求内容无效。');
  return value;
}
export function createHandler(repository) {
  const json = (value, status = 200) => Response.json(value, { status });
  const conflict = row => problem('这条内容已被其他访客修改，请重新载入。', 409, row && present(row));
  async function save(resource, id, version, data, deletedAt = null) {
    if (!Number.isInteger(version) || version < 1) problem('版本号无效。');
    const saved = await repository.update(resource, id, version, data, deletedAt);
    if (!saved) conflict(await repository.get(resource, id));
    return saved;
  }
  async function route(request) {
    const url = new URL(request.url);
    const marker = url.pathname.indexOf('/api/');
    if (marker < 0) problem('资源不存在。', 404);
    const parts = url.pathname.slice(marker + 5).split('/');
    if (parts[0] === 'health' && request.method === 'GET' && parts.length === 1) {
      await repository.counter(); return json({ ok: true, shared: true, importsLocalData: false });
    }
    if (parts[0] === 'counter') {
      if (url.search) problem('查询参数无效。');
      if (parts.length === 1 && request.method === 'GET') return json(await repository.counter());
      if (parts.length === 2 && parts[1] === 'increments' && request.method === 'POST') {
        const input = await body(request);
        if (Object.keys(input).some(key => key !== 'id') || !UUID.test(input.id)) problem('计数操作编号无效。');
        return json(await repository.counter(input.id));
      }
      problem('不支持的计数请求。', 405);
    }
    if (parts[0] === 'calendar' && parts.length === 1 && request.method === 'GET') {
      const rows = await Promise.all(calendarTypes.map(type => repository.list(type, url.searchParams.get('includeDeleted') === 'true')));
      return json(Object.fromEntries(['dayNotes', 'anniversaries', 'journals'].map((key, i) => [key, rows[i].map(present)])));
    }
    const calendar = parts[0] === 'calendar';
    const [resource, id, action] = calendar ? parts.slice(1) : parts;
    if (![...calendarTypes, 'thoughts', 'windows', 'media'].includes(resource) ||
      (calendar && !calendarTypes.includes(resource)) || parts.length > (calendar ? 4 : 3) || (id && !UUID.test(id))) problem('资源不存在。', 404);
    if (resource === 'media') return media(request, id, action);
    if (!id && request.method === 'GET' && !calendar) {
      const rows = (await repository.list(resource)).map(present);
      if (resource === 'windows') rows.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
      return json(rows);
    }
    if (!id && request.method === 'POST') {
      const data = fields(resource, await body(request));
      await validateMedia(resource, data);
      try { return json(present(await repository.insert(resource, data)), 201); }
      catch (error) {
        if (error.status !== 409 || !['day-notes', 'journals'].includes(resource)) throw error;
        const key = resource === 'day-notes' ? 'note_date' : 'period_key';
        const previous = (await repository.list(resource, true)).find(row => row.data[key] === data[key]);
        if (previous?.deleted_at) return json(present(await save(resource, previous.id, previous.version, data)));
        conflict(previous);
      }
    }
    if (!id) problem('不支持的请求方法。', 405);
    const existing = await repository.get(resource, id);
    if (!existing) problem('记录不存在。', 404);
    const input = await body(request);
    if (!action && request.method === 'PATCH') {
      if (input.id && input.id !== id) problem('记录编号不匹配。');
      const data = fields(resource, input, existing.data);
      if (resource === 'day-notes' && data.note_date !== existing.data.note_date || resource === 'journals' && data.period_key !== existing.data.period_key) problem('不能修改记录所属日期区间。');
      await validateMedia(resource, data);
      return json(present(await save(resource, id, input.version, data)));
    }
    if ((!action && request.method === 'DELETE') || (action === 'restore' && request.method === 'POST')) {
      if (Object.keys(input).some(key => key !== 'version')) problem('请求包含不支持的字段。');
      return json(present(await save(resource, id, input.version, existing.data, action ? null : new Date().toISOString())));
    }
    problem('不支持的请求方法。', 405);
  }
  async function validateMedia(resource, data) {
    if (!['thoughts', 'windows'].includes(resource) || !data.mediaId) return;
    const asset = await repository.get('media', data.mediaId);
    const limit = (resource === 'thoughts' ? 10 : 12) * 1024 * 1024;
    if (!asset || asset.deleted_at || asset.data.status !== 'ready' || asset.data.mime_type !== data.mediaType || asset.data.size_bytes > limit ||
      resource === 'thoughts' && !['image/jpeg', 'image/png', 'image/webp'].includes(data.mediaType)) problem('共享图片不可用。');
  }
  async function media(request, id, action) {
    if (!id && request.method === 'POST') {
      const input = await body(request);
      if (Object.keys(input).some(key => !['originalName', 'mimeType', 'sizeBytes'].includes(key)) || !text(input.originalName, 240) ||
        !text(input.mimeType, 150) || !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0 || input.sizeBytes > 50 * 1024 * 1024) problem('文件名、类型或大小无效。');
      return json(present(await repository.insert('media', { original_name: input.originalName, mime_type: input.mimeType,
        size_bytes: input.sizeBytes, status: 'pending' })), 201);
    }
    if (!id) problem('媒体不存在。', 404);
    const asset = await repository.get('media', id);
    if (!asset) problem('媒体不存在。', 404);
    if (action === 'content' && request.method === 'PUT') {
      if (asset.deleted_at || !['pending', 'failed'].includes(asset.data.status)) conflict(asset);
      const claimed = await save('media', id, asset.version, { ...asset.data, status: 'uploading' });
      try {
        const bytes = await readBytes(request, asset.data.size_bytes);
        if (bytes.length !== asset.data.size_bytes) problem('文件大小与声明不符。');
        await repository.upload(id, bytes, 'application/octet-stream');
        return json(present(await save('media', id, claimed.version, { ...asset.data, status: 'ready' })));
      } catch (error) {
        await save('media', id, claimed.version, { ...asset.data, status: 'failed' });
        throw error;
      }
    }
    if ((action === 'content' || action === 'url') && ['GET', 'HEAD'].includes(request.method)) {
      if (asset.deleted_at || asset.data.status !== 'ready') problem('媒体不可访问。', 404);
      if (action === 'url') return json({ url: await repository.signedURL(id) });
      const response = await repository.download(id);
      if (!response.ok) problem('媒体不可访问。', 404);
      return new Response(request.method === 'HEAD' ? null : response.body, { headers: {
        'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment',
        'X-Content-Type-Options': 'nosniff', 'Content-Length': String(asset.data.size_bytes)
      } });
    }
    if ((!action && request.method === 'DELETE') || (action === 'restore' && request.method === 'POST')) {
      const input = await body(request);
      if (Object.keys(input).some(key => key !== 'version')) problem('请求包含不支持的字段。');
      return json(present(await save('media', id, input.version, asset.data, action ? null : new Date().toISOString())));
    }
    problem('不支持的媒体请求。', 405);
  }
  return async request => {
    let response;
    try { response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request); }
    catch (error) { response = json({ message: error.status ? error.message : '共享服务暂时不可用，请稍后重试。',
      code: error.status === 409 ? 'VERSION_CONFLICT' : error.status ? 'INVALID_REQUEST' : 'SERVICE_UNAVAILABLE',
      ...(error.status === 409 ? { remote: error.remote || null } : {}) }, error.status || 503); }
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'content-type,apikey,authorization');
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  };
}


export function withAPIKey(handler, keys) {
  const allowed = new Set(keys);
  return request => {
    if (request.method === 'OPTIONS' || allowed.has(request.headers.get('apikey'))) return handler(request);
    return Response.json({ message: '缺少有效的站点访问凭据。', code: 'UNAUTHORIZED' }, {
      status: 401, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
    });
  };
}
