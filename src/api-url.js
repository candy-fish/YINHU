// The deployed Pages site supplies only a public API URL, never database credentials.
export function apiURL(path) {
  const base = globalThis.BLACKDOOR_CONFIG?.apiBase;
  return base ? `${base.replace(/\/$/, '')}${path}` : path;
}

export function apiHeaders() {
  const key = globalThis.BLACKDOOR_CONFIG?.publicApiKey;
  return key ? { apikey: key } : {};
}

export const sharedCloudEnabled = () => globalThis.BLACKDOOR_CONFIG?.shared === true;
