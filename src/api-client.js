import { ConflictError } from './services/conflict-error.js';
import { apiURL, apiHeaders } from './api-url.js';

export async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const json = body !== undefined && !(body instanceof Blob);
  const response = await fetch(apiURL(path), {
    method, headers: { ...apiHeaders(), ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : json ? JSON.stringify(body) : body,
    cache: 'no-store'
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 409) throw new ConflictError(result.message, result.remote);
    const error = new Error(result.message || '共享服务请求失败。');
    error.code = result.code;
    throw error;
  }
  return result;
}
