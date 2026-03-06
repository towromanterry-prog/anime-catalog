import dotenv from 'dotenv';
dotenv.config();

export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 8008),
  frontendUrl: process.env.FRONTEND_URL || 'http://127.0.0.1:5173',
  dbPath: process.env.DB_PATH || './data/app.db',
  adminKey: process.env.ADMIN_KEY || 'dev-admin-key',
  tokenEncKey: process.env.TOKEN_ENC_KEY || 'dev-token-encryption-key',
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 14),
  userSyncTtlSeconds: Number(process.env.USER_SYNC_TTL_SECONDS || 1800),
  refreshStuckSeconds: Number(process.env.REFRESH_STUCK_SECONDS || 600),
  tagRankThreshold: Number(process.env.TAG_RANK_THRESHOLD || 40),
  anilistUrl: process.env.ANILIST_URL || 'https://graphql.anilist.co',
  anilistTimeoutMs: Number(process.env.ANILIST_TIMEOUT_MS || 8000),
  anilistConcurrency: Number(process.env.ANILIST_CONCURRENCY || 2),
  anilistMaxRetries: Number(process.env.ANILIST_MAX_RETRIES || 3),
  anilistClientId: process.env.ANILIST_CLIENT_ID || '',
  anilistClientSecret: process.env.ANILIST_CLIENT_SECRET || '',
  anilistRedirectUri: process.env.ANILIST_REDIRECT_URI || 'http://127.0.0.1:8008/api/auth/anilist/callback'
};

export const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL', 'ALL'];
export const FORMATS = ['TV', 'TV_SHORT', 'ONA', 'MOVIE', 'SPECIAL', 'OVA'];
export const MEDIA_STATUSES = ['RELEASING', 'FINISHED', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'];
export const USER_STATUSES = ['CURRENT', 'COMPLETED', 'DROPPED', 'PLANNING', 'PAUSED', 'REPEATING'];
