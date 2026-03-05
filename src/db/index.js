import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

const dbDir = path.dirname(config.dbPath);
fs.mkdirSync(dbDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY,
      year INTEGER NOT NULL,
      season TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      siteUrl TEXT,
      coverLarge TEXT,
      averageScore INTEGER,
      popularity INTEGER,
      format TEXT,
      status TEXT,
      isAdult INTEGER DEFAULT 0,
      has_prequel INTEGER,
      updatedAt TEXT NOT NULL,
      genres_json TEXT
    );
    CREATE TABLE IF NOT EXISTS media_genres (
      media_id INTEGER NOT NULL,
      genre TEXT NOT NULL,
      PRIMARY KEY(media_id, genre)
    );
    CREATE TABLE IF NOT EXISTS media_tags (
      media_id INTEGER NOT NULL,
      tag_name TEXT NOT NULL,
      rank INTEGER,
      category TEXT,
      isAdult INTEGER DEFAULT 0,
      isSpoiler INTEGER DEFAULT 0,
      PRIMARY KEY(media_id, tag_name)
    );
    CREATE TABLE IF NOT EXISTS cache_keys (
      cache_key TEXT PRIMARY KEY,
      updatedAt TEXT,
      ttlSeconds INTEGER NOT NULL,
      refreshing INTEGER DEFAULT 0,
      refreshStartedAt TEXT,
      lastError TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anilist_id INTEGER UNIQUE NOT NULL,
      anilist_name TEXT,
      token_enc TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      lastSeenAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_media_list (
      user_id INTEGER NOT NULL,
      media_id INTEGER NOT NULL,
      status TEXT,
      progress INTEGER,
      score REAL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY(user_id, media_id)
    );
    CREATE TABLE IF NOT EXISTS user_media_flags (
      user_id INTEGER NOT NULL,
      media_id INTEGER NOT NULL,
      watchLater INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 0,
      note TEXT,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY(user_id, media_id)
    );
    CREATE TABLE IF NOT EXISTS user_sync_keys (
      user_id INTEGER PRIMARY KEY,
      updatedAt TEXT,
      ttlSeconds INTEGER NOT NULL,
      refreshing INTEGER DEFAULT 0,
      refreshStartedAt TEXT,
      lastError TEXT
    );

    CREATE TABLE IF NOT EXISTS user_filter_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      filters_json TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(user_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_media_season_year ON media(year, season);
    CREATE INDEX IF NOT EXISTS idx_media_score ON media(averageScore DESC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_tag_name ON media_tags(tag_name);
    CREATE INDEX IF NOT EXISTS idx_user_list_status ON user_media_list(user_id, status);
  `);

  // Fast search (v0.4): optional FTS5 index on titles.
  // Best-effort: app still works if FTS is unavailable.
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS media_fts
      USING fts5(title, content='media', content_rowid='id', tokenize='unicode61');

      CREATE TRIGGER IF NOT EXISTS media_ai AFTER INSERT ON media BEGIN
        INSERT INTO media_fts(rowid, title) VALUES (new.id, new.title);
      END;
      CREATE TRIGGER IF NOT EXISTS media_ad AFTER DELETE ON media BEGIN
        INSERT INTO media_fts(media_fts, rowid, title) VALUES('delete', old.id, old.title);
      END;
      CREATE TRIGGER IF NOT EXISTS media_au AFTER UPDATE OF title ON media BEGIN
        INSERT INTO media_fts(media_fts, rowid, title) VALUES('delete', old.id, old.title);
        INSERT INTO media_fts(rowid, title) VALUES (new.id, new.title);
      END;
    `);
    db.exec(`INSERT INTO media_fts(media_fts) VALUES('rebuild');`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[db] FTS init skipped:', e?.message || e);
  }
}
