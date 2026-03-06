import express from 'express';
import { db } from '../db/index.js';
import { config, FORMATS, MEDIA_STATUSES, SEASONS, USER_STATUSES } from '../config.js';
import { parseCatalogQuery } from '../utils/catalog.js';
import { badRequest } from '../utils/errors.js';
import { ensureCatalogSWR, fetchLiveCatalogPage, getCatalogCacheMeta, getMeta, lazyFetchTitle, listCatalog, refreshCatalog, suggestTags } from '../services/catalog-service.js';
import { requireAdmin } from '../middleware/security.js';
import { createSession, requireAuth } from '../auth/session.js';
import { decryptToken, encryptToken } from '../auth/crypto.js';
import { getUserList, getUserSyncMeta, syncUserList } from '../services/user-service.js';
import { buildPresetFromLegacyQuery, isPresetObject, normalizePresetObject, presetHash } from '../services/filter-preset-service.js';

const router = express.Router();
const suggestRate = new Map();

function sendWithMeta(req, res, body) {
  res.json({ ...body, meta: { ...(body.meta || {}), requestId: req.requestId } });
}

router.get('/health', (req, res) => sendWithMeta(req, res, { data: { ok: true } }));
router.get('/ready', (req, res, next) => {
  try {
    db.prepare('SELECT 1 as ok').get();
    sendWithMeta(req, res, { data: { ready: true } });
  } catch (e) { next(e); }
});

router.get('/catalog', (req, res, next) => {
  (async () => {
    try {
    const filters = parseCatalogQuery(req.query);
    // Kick SWR first so cache meta reflects refreshing=true when we fall back to live page.
    ensureCatalogSWR(filters.year, filters.season, req.requestId);
    const cache = getCatalogCacheMeta(filters.year, filters.season);

    // Cache missing → serve a best-effort live page and start a full refresh in background.
    if (!cache.updatedAt) {
      const live = await fetchLiveCatalogPage(filters, req.requestId);
      const cacheAfter = getCatalogCacheMeta(filters.year, filters.season);
      sendWithMeta(req, res, {
        data: live.rows,
        meta: {
          cache: { ...cacheAfter, stale: true },
          paging: { offset: filters.offset, limit: filters.limit, total: live.total },
          appliedFilters: {
            strictMatch: filters.strictMatch,
            includeGenres: filters.includeGenres,
            includeTags: filters.includeTags
          }
        }
      });
      return;
    }

    const { total, rows } = listCatalog(filters, req.session?.user_id);
    const freshCache = getCatalogCacheMeta(filters.year, filters.season);
    sendWithMeta(req, res, {
      data: rows,
      meta: {
        cache: { ...freshCache, stale: freshCache.stale },
        paging: { offset: filters.offset, limit: filters.limit, total },
        appliedFilters: {
          strictMatch: filters.strictMatch,
          includeGenres: filters.includeGenres,
          includeTags: filters.includeTags
        }
      }
    });
    } catch (e) { next(e); }
  })();
});

router.get('/meta', (req, res) => {
  sendWithMeta(req, res, { data: { seasons: SEASONS, formats: FORMATS, statuses: MEDIA_STATUSES, userStatuses: USER_STATUSES, ...getMeta() } });
});

router.get('/suggest/tags', (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return sendWithMeta(req, res, { data: [] });
    if (q.length > 64) throw badRequest('q max length is 64');
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const stat = suggestRate.get(ip) || { count: 0, resetAt: now + 60_000 };
    if (now > stat.resetAt) { stat.count = 0; stat.resetAt = now + 60_000; }
    stat.count += 1;
    suggestRate.set(ip, stat);
    if (stat.count > 60) throw Object.assign(new Error('Too many requests'), { statusCode: 429, error: 'RATE_LIMITED' });
    sendWithMeta(req, res, { data: suggestTags(q).slice(0, 20) });
  } catch (e) { next(e); }
});

router.get('/title/:id', async (req, res, next) => {
  try {
    const row = await lazyFetchTitle(Number(req.params.id), req.requestId);
    if (!row) throw Object.assign(new Error('Not found'), { statusCode: 404, error: 'NOT_FOUND' });
    const genres = db
      .prepare('SELECT genre FROM media_genres WHERE media_id=? ORDER BY genre ASC')
      .all(row.id)
      .map((r) => r.genre);
    const tags = db
      .prepare('SELECT tag_name as name, rank, category, isAdult, isSpoiler FROM media_tags WHERE media_id=? ORDER BY rank DESC, tag_name ASC')
      .all(row.id);
    sendWithMeta(req, res, { data: { ...row, genres, tags } });
  } catch (e) { next(e); }
});

router.get('/admin/cache', requireAdmin, (req, res) => {
  sendWithMeta(req, res, { data: db.prepare('SELECT * FROM cache_keys ORDER BY cache_key').all() });
});
router.post('/admin/cache/refresh', requireAdmin, async (req, res, next) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const season = String(req.query.season || 'ALL').toUpperCase();
    const out = await refreshCatalog(year, season, req.requestId);
    sendWithMeta(req, res, { data: out });
  } catch (e) { next(e); }
});

router.get('/auth/anilist/start', (req, res) => {
  const state = Math.random().toString(36).slice(2);
  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  const url = new URL('https://anilist.co/api/v2/oauth/authorize');
  url.searchParams.set('client_id', config.anilistClientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.anilistRedirectUri);
  url.searchParams.set('state', state);
  sendWithMeta(req, res, { data: { url: url.toString() } });
});

router.get('/auth/anilist/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    if (!code || !state || state !== req.cookies.oauth_state) throw badRequest('Invalid OAuth state');
    const tokenResp = await fetch('https://anilist.co/api/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: config.anilistClientId,
        client_secret: config.anilistClientSecret,
        redirect_uri: config.anilistRedirectUri,
        code
      })
    }).then((r) => r.json());
    if (!tokenResp.access_token) throw badRequest('OAuth exchange failed');
    const viewer = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenResp.access_token}` },
      body: JSON.stringify({ query: 'query{Viewer{id name}}' })
    }).then((r) => r.json());
    const v = viewer.data.Viewer;
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users(anilist_id, anilist_name, token_enc, createdAt, updatedAt) VALUES(?,?,?,?,?)
      ON CONFLICT(anilist_id) DO UPDATE SET anilist_name=excluded.anilist_name, token_enc=excluded.token_enc, updatedAt=excluded.updatedAt`)
      .run(v.id, v.name, encryptToken(tokenResp.access_token), now, now);
    const user = db.prepare('SELECT id FROM users WHERE anilist_id=?').get(v.id);
    const session = createSession(user.id);
    res.cookie('sid', session.sessionId, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.redirect(config.frontendUrl || '/');
  } catch (e) { next(e); }
});

router.get('/auth/me', (req, res) => {
  if (!req.session) return sendWithMeta(req, res, { data: null });
  sendWithMeta(req, res, { data: { id: req.session.user_id, anilistId: req.session.anilist_id, name: req.session.anilist_name } });
});

router.post('/auth/logout', (req, res) => {
  if (req.cookies.sid) db.prepare('DELETE FROM sessions WHERE session_id=?').run(req.cookies.sid);
  res.clearCookie('sid', { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  sendWithMeta(req, res, { data: { ok: true } });
});

router.get('/me/list', requireAuth, (req, res) => {
  const meta = getUserSyncMeta(req.session.user_id);
  const tokenEnc = db.prepare('SELECT token_enc FROM users WHERE id=?').get(req.session.user_id)?.token_enc;
  if ((meta.stale || !meta.updatedAt) && tokenEnc) syncUserList(req.session.user_id, decryptToken(tokenEnc), req.requestId).catch(() => {});
  sendWithMeta(req, res, { data: getUserList(req.session.user_id), meta: { cache: getUserSyncMeta(req.session.user_id) } });
});

router.post('/me/list/refresh', requireAuth, async (req, res, next) => {
  try {
    const tokenEnc = db.prepare('SELECT token_enc FROM users WHERE id=?').get(req.session.user_id)?.token_enc;
    const out = await syncUserList(req.session.user_id, decryptToken(tokenEnc), req.requestId);
    sendWithMeta(req, res, { data: out });
  } catch (e) { next(e); }
});

router.get('/me/flags', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM user_media_flags WHERE user_id=? ORDER BY updatedAt DESC').all(req.session.user_id);
  sendWithMeta(req, res, { data: rows });
});

router.put('/me/flags/:mediaId', requireAuth, (req, res, next) => {
  try {
    const mediaId = Number(req.params.mediaId);
    const body = req.body || {};
    const existing = db
      .prepare('SELECT watchLater, hidden, favorite, note FROM user_media_flags WHERE user_id=? AND media_id=?')
      .get(req.session.user_id, mediaId);

    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    const nextWatchLater = has('watchLater') ? (body.watchLater ? 1 : 0) : (existing?.watchLater || 0);
    const nextHidden = has('hidden') ? (body.hidden ? 1 : 0) : (existing?.hidden || 0);
    const nextFavorite = has('favorite') ? (body.favorite ? 1 : 0) : (existing?.favorite || 0);
    const nextNote = has('note') ? (body.note ?? null) : (existing?.note ?? null);
    if (nextNote && String(nextNote).length > 500) throw badRequest('note max length 500');

    db.prepare(`INSERT INTO user_media_flags(user_id,media_id,watchLater,hidden,favorite,note,updatedAt) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(user_id,media_id) DO UPDATE SET watchLater=excluded.watchLater, hidden=excluded.hidden, favorite=excluded.favorite, note=excluded.note, updatedAt=excluded.updatedAt`)
      .run(req.session.user_id, mediaId, nextWatchLater, nextHidden, nextFavorite, nextNote, new Date().toISOString());
    sendWithMeta(req, res, { data: { ok: true } });
  } catch (e) { next(e); }
});


router.get('/me/filter-presets', requireAuth, (req, res) => {
  // Server-side migration: always return {preset:{v,patch}} and clean up legacy rows.
  const rows = db
    .prepare('SELECT id, name, filters_json as filtersJson, updatedAt FROM user_filter_presets WHERE user_id=? ORDER BY updatedAt DESC')
    .all(req.session.user_id);

  const keep = [];
  const toDelete = [];
  const seen = new Map(); // hash -> kept row

  const tx = db.transaction(() => {
    for (const r of rows) {
      let obj = null;
      try { obj = JSON.parse(r.filtersJson); } catch { obj = null; }

      let preset = null;
      if (isPresetObject(obj)) preset = normalizePresetObject(obj);
      else if (obj && typeof obj === 'object') preset = buildPresetFromLegacyQuery(obj);

      if (!preset) {
        toDelete.push(r.id);
        continue;
      }

      const hash = presetHash(preset);
      const canonJson = JSON.stringify(preset);

      // Persist migration if needed (legacy -> preset). Keep updatedAt as-is.
      if (canonJson !== r.filtersJson) {
        db.prepare('UPDATE user_filter_presets SET filters_json=? WHERE user_id=? AND id=?')
          .run(canonJson, req.session.user_id, r.id);
      }

      // Dedup by hash: keep the most recently updated row.
      const prev = seen.get(hash);
      if (!prev) {
        const rowOut = { id: r.id, name: r.name, preset, updatedAt: r.updatedAt, hash };
        seen.set(hash, rowOut);
        keep.push(rowOut);
      } else {
        // Compare updatedAt strings (ISO) lexicographically
        const isNewer = String(r.updatedAt || '') > String(prev.updatedAt || '');
        if (isNewer) {
          toDelete.push(prev.id);
          // replace kept row
          prev.id = r.id;
          prev.name = r.name;
          prev.preset = preset;
          prev.updatedAt = r.updatedAt;
        } else {
          toDelete.push(r.id);
        }
      }
    }

    if (toDelete.length) {
      const q = 'DELETE FROM user_filter_presets WHERE user_id=? AND id IN (' + toDelete.map(() => '?').join(',') + ')';
      db.prepare(q).run(req.session.user_id, ...toDelete);
    }
  });

  tx();

  // Return only canonical preset objects
  const out = keep
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .map((r) => ({ id: r.id, name: r.name, preset: r.preset, updatedAt: r.updatedAt }));

  sendWithMeta(req, res, { data: out });
});

router.post('/me/filter-presets', requireAuth, (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) throw badRequest('name is required');
    if (name.length > 40) throw badRequest('name max length 40');

    const payload = req.body?.preset ?? req.body?.filters;
    if (!payload || typeof payload !== 'object') throw badRequest('preset (or legacy filters) must be an object');

    const preset = isPresetObject(payload) ? normalizePresetObject(payload) : buildPresetFromLegacyQuery(payload);
    if (!preset) throw badRequest('invalid preset');

    const hash = presetHash(preset);
    const presetJson = JSON.stringify(preset);
    if (presetJson.length > 5000) throw badRequest('filters too large');

    const count = db.prepare('SELECT COUNT(*) as c FROM user_filter_presets WHERE user_id=?').get(req.session.user_id).c;
    if (count >= 50) throw badRequest('Too many presets (max 50)');

    // Dedup by hash: if an identical preset exists, return it instead of creating a duplicate.
    const existing = db
      .prepare('SELECT id, name, filters_json as filtersJson, updatedAt FROM user_filter_presets WHERE user_id=?')
      .all(req.session.user_id);

    for (const r of existing) {
      let obj = null;
      try { obj = JSON.parse(r.filtersJson); } catch { obj = null; }
      const p = isPresetObject(obj) ? normalizePresetObject(obj) : (obj && typeof obj === 'object' ? buildPresetFromLegacyQuery(obj) : null);
      if (!p) continue;
      if (presetHash(p) === hash) {
        const now = new Date().toISOString();
        // store canonical JSON (also migrates legacy row)
        db.prepare('UPDATE user_filter_presets SET filters_json=?, updatedAt=? WHERE user_id=? AND id=?')
          .run(presetJson, now, req.session.user_id, r.id);

        let outName = r.name;
        if (outName !== name) {
          try {
            db.prepare('UPDATE user_filter_presets SET name=? WHERE user_id=? AND id=?')
              .run(name, req.session.user_id, r.id);
            outName = name;
          } catch {
            // ignore name conflicts
          }
        }

        sendWithMeta(req, res, { data: { id: r.id, name: outName, updatedAt: now } });
        return;
      }
    }

    const now = new Date().toISOString();
    db.prepare(`INSERT INTO user_filter_presets(user_id,name,filters_json,createdAt,updatedAt) VALUES(?,?,?,?,?)
      ON CONFLICT(user_id,name) DO UPDATE SET filters_json=excluded.filters_json, updatedAt=excluded.updatedAt`)
      .run(req.session.user_id, name, presetJson, now, now);

    const row = db.prepare('SELECT id, updatedAt FROM user_filter_presets WHERE user_id=? AND name=?').get(req.session.user_id, name);
    sendWithMeta(req, res, { data: { id: row.id, name, updatedAt: row.updatedAt } });
  } catch (e) { next(e); }
});

router.patch('/me/filter-presets/:id', requireAuth, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw badRequest('invalid id');
    const name = String(req.body?.name || '').trim();
    if (!name) throw badRequest('name is required');
    if (name.length > 40) throw badRequest('name max length 40');

    const now = new Date().toISOString();
    try {
      db.prepare('UPDATE user_filter_presets SET name=?, updatedAt=? WHERE user_id=? AND id=?')
        .run(name, now, req.session.user_id, id);
    } catch (e) {
      // unique(user_id,name)
      throw badRequest('name already exists');
    }

    const row = db.prepare('SELECT id, name, updatedAt FROM user_filter_presets WHERE user_id=? AND id=?').get(req.session.user_id, id);
    sendWithMeta(req, res, { data: row || { ok: true } });
  } catch (e) { next(e); }
});

router.delete('/me/filter-presets/:id', requireAuth, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw badRequest('invalid id');
    db.prepare('DELETE FROM user_filter_presets WHERE user_id=? AND id=?').run(req.session.user_id, id);
    sendWithMeta(req, res, { data: { ok: true } });
  } catch (e) { next(e); }
});

export default router;
