import { apiFetch } from './http.js';

export async function fetchMyList() {
  return apiFetch('/api/me/list');
}

export async function refreshMyList() {
  return apiFetch('/api/me/list/refresh', { method: 'POST' });
}

export async function fetchFlags() {
  return apiFetch('/api/me/flags');
}

export async function updateFlags(mediaId, patch) {
  return apiFetch(`/api/me/flags/${encodeURIComponent(mediaId)}`, {
    method: 'PUT',
    body: patch
  });
}


export async function fetchFilterPresets() {
  return apiFetch('/api/me/filter-presets');
}

// New format: save a preset object: { v, patch }.
// Server is backward-compatible with legacy {filters}.
export async function saveFilterPreset(name, preset) {
  return apiFetch('/api/me/filter-presets', {
    method: 'POST',
    body: { name, preset }
  });
}

export async function renameFilterPreset(id, name) {
  return apiFetch(`/api/me/filter-presets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { name }
  });
}

export async function deleteFilterPreset(id) {
  return apiFetch(`/api/me/filter-presets/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}
