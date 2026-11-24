export function createTravelRepository({ url, serviceKey, fetcher = fetch }) {
  async function rest(query = '', options = {}) {
    const response = await fetcher(`${url}/rest/v1/blackdoor_travel_regions${query}`, { ...options,
      headers: { apikey: serviceKey, ...(serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${serviceKey}` } : {}),
        'Content-Type': 'application/json', Prefer: 'return=representation' } });
    if (response.status === 409) return null;
    if (!response.ok) throw new Error('Shared travel database unavailable');
    return response.json();
  }
  return {
    async list() {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const page = await rest(`?order=region_id&limit=500&offset=${offset}`); rows.push(...page);
        if (page.length < 500) return rows;
      }
    },
    async get(id) { return (await rest(`?region_id=eq.${encodeURIComponent(id)}`))[0] || null; },
    async save(id, color, version) {
      const result = version === 0
        ? await rest('', { method: 'POST', body: JSON.stringify({ region_id: id, color }) })
        : await rest(`?region_id=eq.${encodeURIComponent(id)}&version=eq.${version}`, { method: 'PATCH',
          body: JSON.stringify({ color, version: version + 1, updated_at: new Date().toISOString() }) });
      return result?.[0] || null;
    }
  };
}
