import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../config.js';

export function createSession(userId) {
  const sessionId = randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionTtlSeconds * 1000).toISOString();
  db.prepare('INSERT INTO sessions(session_id, user_id, createdAt, expiresAt, lastSeenAt) VALUES(?,?,?,?,?)')
    .run(sessionId, userId, now.toISOString(), expires, now.toISOString());
  return { sessionId, expiresAt: expires };
}

export function loadSession(req, _res, next) {
  const sid = req.cookies.sid;
  if (!sid) return next();
  const row = db.prepare(`SELECT s.session_id, s.user_id, s.expiresAt, u.anilist_id, u.anilist_name
      FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.session_id=?`).get(sid);
  if (row && new Date(row.expiresAt) > new Date()) {
    req.session = row;
    db.prepare('UPDATE sessions SET lastSeenAt=? WHERE session_id=?').run(new Date().toISOString(), sid);
  }
  return next();
}

export function requireAuth(req, _res, next) {
  if (!req.session) return next(Object.assign(new Error('Unauthorized'), { statusCode: 401, error: 'UNAUTHORIZED' }));
  return next();
}
