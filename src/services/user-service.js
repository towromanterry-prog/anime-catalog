import { db } from '../db/index.js';
import { config } from '../config.js';
import { anilistRequest } from './anilist-client.js';

function nowIso() { return new Date().toISOString(); }

export function getUserToken(userId) {
  return db.prepare('SELECT token_enc FROM users WHERE id=?').get(userId)?.token_enc;
}

export function getUserSyncMeta(userId) {
  const row = db.prepare('SELECT * FROM user_sync_keys WHERE user_id=?').get(userId);
  if (!row || !row.updatedAt) return { stale: true, refreshing: !!row?.refreshing, updatedAt: null, ttlSeconds: config.userSyncTtlSeconds, lastError: row?.lastError || null, ageSeconds: null };
  const age = Math.floor((Date.now() - new Date(row.updatedAt).getTime()) / 1000);
  return { stale: age > row.ttlSeconds, refreshing: !!row.refreshing, updatedAt: row.updatedAt, ttlSeconds: row.ttlSeconds, lastError: row.lastError, ageSeconds: age };
}

export function getUserList(userId) {
  return db.prepare('SELECT * FROM user_media_list WHERE user_id=? ORDER BY updatedAt DESC').all(userId);
}

export async function syncUserList(userId, accessToken, requestId) {
  const current = db.prepare('SELECT * FROM user_sync_keys WHERE user_id=?').get(userId);
  if (current?.refreshing && current.refreshStartedAt && (Date.now() - new Date(current.refreshStartedAt).getTime()) < config.refreshStuckSeconds * 1000) {
    return { started: false };
  }
  db.prepare(`INSERT INTO user_sync_keys(user_id,ttlSeconds,refreshing,refreshStartedAt,lastError) VALUES(?,?,?,?,NULL)
    ON CONFLICT(user_id) DO UPDATE SET refreshing=1, refreshStartedAt=excluded.refreshStartedAt, ttlSeconds=excluded.ttlSeconds`).run(userId, config.userSyncTtlSeconds, 1, nowIso());

  try {
    // IMPORTANT:
    // AniList's MediaListCollection expects a concrete userId or userName.
    // Passing an explicit null (userId:null) can break schema validation.
    const anilistId = db.prepare('SELECT anilist_id FROM users WHERE id=?').get(userId)?.anilist_id;
    if (!anilistId) throw new Error('Missing AniList user id');

    const query = `query ($userId: Int, $type: MediaType) {
      MediaListCollection(userId: $userId, type: $type) {
        lists {
          name
          entries {
            status
            progress
            score
            media { id }
          }
        }
      }
    }`;
    const resp = await anilistRequest({ query, variables: { userId: Number(anilistId), type: 'ANIME' }, accessToken, requestId });
    if (resp.error) {
      const details = resp.details ? ` | ${JSON.stringify(resp.details).slice(0, 1200)}` : '';
      throw new Error(`${resp.error}${details}`);
    }
    const entries = [];
    for (const list of resp.data.MediaListCollection?.lists || []) {
      for (const e of list.entries || []) {
        entries.push({ mediaId: e.media?.id, status: e.status, progress: e.progress || 0, score: e.score || null });
      }
    }
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM user_media_list WHERE user_id=?').run(userId);
      const upsert = db.prepare('INSERT OR REPLACE INTO user_media_list(user_id, media_id, status, progress, score, updatedAt) VALUES(?,?,?,?,?,?)');
      const ts = nowIso();
      for (const e of entries) {
        if (!e.mediaId) continue;
        upsert.run(userId, e.mediaId, e.status, e.progress, e.score, ts);
      }
    });
    tx();
    db.prepare('UPDATE user_sync_keys SET refreshing=0, updatedAt=?, lastError=NULL WHERE user_id=?').run(nowIso(), userId);
    return { started: true };
  } catch (error) {
    db.prepare('UPDATE user_sync_keys SET refreshing=0, lastError=? WHERE user_id=?').run(String(error.message || error), userId);
    return { started: true, failed: true };
  }
}
