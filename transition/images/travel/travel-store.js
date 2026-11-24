import publicConfig from '../../../deployment.public.json' with { type: 'json' };

// The same shared workspace is used on every device. Never fall back to device-only data.
export function createTravelStore({ fetcher = fetch, config = globalThis.BLACKDOOR_CONFIG || publicConfig } = {}) {
  const base = new URL('../travel-colors', config.apiBase.replace(/\/$/, '') + '/').href;
  async function request(path = '', options = {}) {
    const response = await fetcher(`${base}/api/regions${path}`, { ...options,
      headers: { apikey: config.publicApiKey, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.message || '共享颜色读取失败，请重试。'),
      { status: response.status, remote: result.remote });
    return result;
  }
  return {
    list: () => request(),
    paint: (id, color, version) => request('/' + encodeURIComponent(id), {
      method: 'PUT', body: JSON.stringify({ color, version })
    })
  };
}
