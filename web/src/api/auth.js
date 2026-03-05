import { apiFetch } from './http.js';

export async function getMe() {
  return apiFetch('/api/auth/me');
}

export async function startAniListLogin() {
  const res = await apiFetch('/api/auth/anilist/start');
  const url = res?.data?.url;
  if (!url) throw new Error('OAuth URL missing');
  window.location.href = url;
}

export async function logout() {
  return apiFetch('/api/auth/logout', { method: 'POST' });
}
