import { apiFetch } from './http.js';

function withQuery(path, params) {
  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return url.pathname + url.search;
}

export async function fetchMeta() {
  return apiFetch('/api/meta');
}

export async function fetchCatalog(params) {
  return apiFetch(withQuery('/api/catalog', params));
}

export async function fetchTitle(id) {
  return apiFetch(`/api/title/${encodeURIComponent(id)}`);
}

export async function suggestTags(q) {
  return apiFetch(withQuery('/api/suggest/tags', { q }));
}
