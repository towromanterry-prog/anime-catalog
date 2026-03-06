import { db } from '../db/index.js';
import { config, FORMATS, MEDIA_STATUSES } from '../config.js';
import { anilistRequest } from './anilist-client.js';
import { cacheKey, ttlBySeason } from '../utils/catalog.js';


let _ftsAvailable = null;
function ftsAvailable() {
  if (_ftsAvailable !== null) return _ftsAvailable;
  try {
    _ftsAvailable = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='media_fts'").get();
  } catch {
    _ftsAvailable = false;
  }
  return _ftsAvailable;
}

function buildFtsQuery(q) {
  const parts = String(q || '')
    .trim()
    .split(/\s+/g)
    .map((s) => s.replace(/[^0-9A-Za-zА-Яа-яЁё_]+/g, ''))
    .filter(Boolean)
    .slice(0, 6);
  if (!parts.length) return null;
  return parts.map((w) => w + '*').join(' AND ');
}

/**
 * season !== 'ALL': AniList seasonYear requires season, so we use both.
 * season === 'ALL': use startDate range (FuzzyDateInt) in one query (no season/seasonYear).
 *
 * startDate_greater / startDate_lesser accept FuzzyDateInt. 1
 * seasonYear requires season. 2
 */
const getPageQuery = (season) => {
  if (season === 'ALL') {
    return `
query ($startGreater:FuzzyDateInt,$startLesser:FuzzyDateInt,$page:Int,$perPage:Int,$formatIn:[MediaFormat],$statusIn:[MediaStatus],$isAdult:Boolean){
  Page(page:$page,perPage:$perPage){
    pageInfo{currentPage hasNextPage total}
    media(
      type:ANIME,
      startDate_greater:$startGreater,
      startDate_lesser:$startLesser,
      format_in:$formatIn,
      status_in:$statusIn,
      isAdult:$isAdult,
      sort:[POPULARITY_DESC]
    ){
      id title{userPreferred} description(asHtml:true) siteUrl coverImage{large}
      averageScore popularity format status isAdult season seasonYear genres
      tags{name rank category isAdult isMediaSpoiler}
    }
  }
}`;
  }

  return `
query ($seasonYear:Int,$season:MediaSeason,$page:Int,$perPage:Int,$formatIn:[MediaFormat],$statusIn:[MediaStatus],$isAdult:Boolean){
  Page(page:$page,perPage:$perPage){
    pageInfo{currentPage hasNextPage total}
    media(
      type:ANIME,
      seasonYear:$seasonYear,
      season:$season,
      format_in:$formatIn,
      status_in:$statusIn,
      isAdult:$isAdult,
      sort:[POPULARITY_DESC]
    ){
      id title{userPreferred} description(asHtml:true) siteUrl coverImage{large}
      averageScore popularity format status isAdult season seasonYear genres
      tags{name rank category isAdult isMediaSpoiler}
    }
  }
}`;
};

const relationQuery = `query($ids:[Int]){Page(page:1, perPage:50){media(id_in:$ids,type:ANIME){id relations{edges{relationType}}}}}`;

function nowIso() {
  return new Date().toISOString();
}

function getCacheState(key, ttl) {
  const row = db.prepare('SELECT * FROM cache_keys WHERE cache_key=?').get(key);
  if (!row || !row.updatedAt) {
    return {
      stale: true,
      refreshing: !!row?.refreshing,
      updatedAt: row?.updatedAt || null,
      ttlSeconds: ttl,
      lastError: row?.lastError || null,
      ageSeconds: null
    };
  }
  const age = Math.floor((Date.now() - new Date(row.updatedAt).getTime()) / 1000);
  return {
    stale: age > row.ttlSeconds,
    refreshing: !!row.refreshing,
    updatedAt: row.updatedAt,
    ttlSeconds: row.ttlSeconds,
    lastError: row.lastError,
    ageSeconds: age
  };
}

export function getCatalogCacheMeta(year, season) {
  const key = cacheKey(year, season);
  return { key, ...getCacheState(key, ttlBySeason(season)) };
}

export function listCatalog(filters, userId) {
  const joins = [];
  const where = ['m.year=?'];
  const args = [filters.year];

  if (filters.season !== 'ALL') {
    where.push('m.season=?');
    args.push(filters.season);
  }
  if (filters.status.length) {
    where.push(`m.status IN (${filters.status.map(() => '?').join(',')})`);
    args.push(...filters.status);
  }
  if (filters.format.length) {
    where.push(`m.format IN (${filters.format.map(() => '?').join(',')})`);
    args.push(...filters.format);
  }
  if (!filters.adult) where.push('m.isAdult=0');
  if (filters.minScore && filters.minScore > 0) {
    where.push('(m.averageScore IS NOT NULL AND m.averageScore >= ?)');
    args.push(filters.minScore);
  }
  if (filters.onlyNew) where.push('m.has_prequel=0');
  if (filters.onlySequels) where.push('m.has_prequel=1');

  // Include genres/tags:
  // - strictMatch=false (default):
  //   * within each group (genres / tags): ANY match
  //   * between groups: AND (if both groups are selected)
  // - strictMatch=true: must match ALL selected include genres AND ALL selected include tags
  const incGenres = Array.isArray(filters.includeGenres) ? filters.includeGenres : [];
  const incTags = Array.isArray(filters.includeTags) ? filters.includeTags : [];
  const strict = !!filters.strictMatch;

  if (strict) {
    if (incGenres.length) {
      for (const g of incGenres) {
        where.push(`EXISTS (SELECT 1 FROM media_genres g WHERE g.media_id=m.id AND g.genre = ?)`);
        args.push(g);
      }
    }
    if (incTags.length) {
      for (const t of incTags) {
        where.push(`EXISTS (SELECT 1 FROM media_tags t WHERE t.media_id=m.id AND t.tag_name = ?)`);
        args.push(t);
      }
    }
  } else {
    // Default (strictMatch=false):
    // - within each group (genres / tags): ANY match
    // - between groups: AND (if both groups are selected)
    if (incGenres.length) {
      where.push(
        `EXISTS (SELECT 1 FROM media_genres g WHERE g.media_id=m.id AND g.genre IN (${incGenres
          .map(() => '?')
          .join(',')}))`
      );
      args.push(...incGenres);
    }
    if (incTags.length) {
      where.push(
        `EXISTS (SELECT 1 FROM media_tags t WHERE t.media_id=m.id AND t.tag_name IN (${incTags
          .map(() => '?')
          .join(',')}))`
      );
      args.push(...incTags);
    }
  }

  if (filters.excludeGenres.length) {
    where.push(
      `NOT EXISTS (SELECT 1 FROM media_genres g WHERE g.media_id=m.id AND g.genre IN (${filters.excludeGenres.map(() => '?').join(',')}))`
    );
    args.push(...filters.excludeGenres);
  }

  if (filters.excludeTags.length) {
    where.push(
      `NOT EXISTS (SELECT 1 FROM media_tags t WHERE t.media_id=m.id AND t.tag_name IN (${filters.excludeTags.map(() => '?').join(',')}))`
    );
    args.push(...filters.excludeTags);
  }

  if (filters.q) {
    const ftsQ = buildFtsQuery(filters.q);
    if (ftsQ && ftsAvailable()) {
      where.push('m.id IN (SELECT rowid FROM media_fts WHERE media_fts MATCH ?)');
      args.push(ftsQ);
    } else {
      where.push('m.title LIKE ?');
      args.push(`%${filters.q}%`);
    }
  }

  if (userId) {
    joins.push('LEFT JOIN user_media_list uml ON uml.media_id=m.id AND uml.user_id=?');
    args.unshift(userId);

    joins.push('LEFT JOIN user_media_flags umf ON umf.media_id=m.id AND umf.user_id=?');
    args.splice(1, 0, userId);

    if (filters.myStatus.length) {
      where.push(`uml.status IN (${filters.myStatus.map(() => '?').join(',')})`);
      args.push(...filters.myStatus);
    }
    if (filters.notInMyList) where.push('uml.media_id IS NULL');
    if (filters.watchLaterOnly) where.push('COALESCE(umf.watchLater,0)=1');
    if (!filters.showHidden) where.push('COALESCE(umf.hidden,0)=0');
  }

  const base = `FROM media m ${joins.join(' ')} WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) as total ${base}`).get(...args).total;

  const userSelect = userId
    ? 'uml.status as myStatus, COALESCE(umf.watchLater,0) as watchLater, COALESCE(umf.hidden,0) as hidden, COALESCE(umf.favorite,0) as favorite'
    : 'NULL as myStatus, 0 as watchLater, 0 as hidden, 0 as favorite';

  const rows = db
    .prepare(`SELECT m.*, ${userSelect} ${base} ORDER BY ${filters.orderBy} LIMIT ? OFFSET ?`)
    .all(...args, filters.limit, filters.offset);

  return { total, rows };
}

export function getMeta() {
  const genres = db
    .prepare('SELECT DISTINCT genre FROM media_genres ORDER BY genre ASC')
    .all()
    .map((r) => r.genre);
  return { genres };
}

export function suggestTags(q) {
  return db
    .prepare(
      'SELECT tag_name FROM media_tags WHERE tag_name LIKE ? GROUP BY tag_name ORDER BY COUNT(*) DESC, tag_name ASC LIMIT 20'
    )
    .all(`${q}%`)
    .map((r) => r.tag_name);
}

function toYearInt(year) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1900 || y > 3000) return null;
  return Math.trunc(y);
}

function mapMediaToRow(media, yearFallback, seasonFallback) {
  return {
    id: media.id,
    year: media.seasonYear || yearFallback,
    season: media.season || seasonFallback,
    title: media.title?.userPreferred || '',
    description: media.description || null,
    siteUrl: media.siteUrl || null,
    coverLarge: media.coverImage?.large || null,
    averageScore: media.averageScore || null,
    popularity: media.popularity || null,
    format: media.format || null,
    status: media.status || null,
    isAdult: media.isAdult ? 1 : 0,
    has_prequel: null,
    updatedAt: nowIso(),
    genres_json: JSON.stringify(media.genres || [])
  };
}

// Used only when cache is missing. We do not use AniList server-side exclusions for tags/genres;
// instead we apply best-effort local filtering on the fetched page.
export async function fetchLiveCatalogPage(filters, requestId) {
  const y = toYearInt(filters.year);
  if (!y) throw new Error('Invalid year');

  const key = cacheKey(y, filters.season);
  const query = getPageQuery(filters.season);

  // AniList perPage max is 50, so we may need to fetch multiple pages to cover offset/limit.
  const pageSize = 50;
  const start = Math.max(0, filters.offset);
  const end = start + Math.max(1, filters.limit);
  const startPage = Math.floor(start / pageSize) + 1;
  const endPage = Math.floor((end - 1) / pageSize) + 1;
  const pages = [];

  // In AniList, adult entries may be hidden unless explicitly requested.
  // For "Adult=true" we fetch both non-adult and adult-only pages and merge.
  const adultModes = filters.adult ? [false, true] : [false];

  let total = null;
  for (const isAdult of adultModes) {
    for (let page = startPage; page <= endPage; page += 1) {
      const varsBase =
        filters.season === 'ALL'
          ? { startGreater: y * 10000, startLesser: (y + 1) * 10000 }
          : { seasonYear: y, season: filters.season };

      const resp = await anilistRequest({
        query,
        variables: {
          ...varsBase,
          page,
          perPage: pageSize,
          formatIn: filters.format,
          statusIn: filters.status,
          isAdult
        },
        requestId
      });

      if (resp.error) {
        const msg = resp.details?.[0]?.message;
        throw new Error(msg ? `${resp.error}: ${msg}` : resp.error);
      }

      const pageData = resp.data.Page;
      if (total == null && typeof pageData?.pageInfo?.total === 'number') total = pageData.pageInfo.total;
      pages.push(...(pageData.media || []));
    }
  }

  // de-dupe (adult/non-adult merges can overlap in some cases)
  const byId = new Map();
  for (const m of pages) byId.set(m.id, m);
  pages.length = 0;
  pages.push(...byId.values());

  // Best-effort local filtering to match SQLite behavior in missing-cache mode.
  let out = pages;
  if (!filters.adult) out = out.filter((m) => !m.isAdult);

  if (filters.minScore && filters.minScore > 0) {
    out = out.filter((m) => (m.averageScore || 0) >= filters.minScore);
  }

  // include genres/tags matching rules mirror SQLite:
  // strictMatch=false:
  //   - within each group: ANY
  //   - between groups: AND (if both groups are selected)
  // strictMatch=true: must contain ALL selected genres AND ALL selected tags
  const incGenres = Array.isArray(filters.includeGenres) ? filters.includeGenres : [];
  const incTags = Array.isArray(filters.includeTags) ? filters.includeTags : [];
  const strict = !!filters.strictMatch;

  if (strict) {
    if (incGenres.length) {
      out = out.filter((m) => incGenres.every((g) => (m.genres || []).includes(g)));
    }
    if (incTags.length) {
      out = out.filter((m) => {
        const names = new Set((m.tags || []).map((t) => t?.name).filter(Boolean));
        return incTags.every((t) => names.has(t));
      });
    }
  } else {
    if (incGenres.length || incTags.length) {
      const gset = new Set(incGenres);
      const tset = new Set(incTags);
      out = out.filter((m) => {
        const hasG = incGenres.length ? (m.genres || []).some((g) => gset.has(g)) : true;
        const hasT = incTags.length ? (m.tags || []).some((t) => tset.has(t?.name)) : true;
        // Between groups: AND. Within each group: ANY.
        return hasG && hasT;
      });
    }
  }

  if (filters.excludeGenres?.length) {
    const set = new Set(filters.excludeGenres);
    out = out.filter((m) => !(m.genres || []).some((g) => set.has(g)));
  }
  if (filters.excludeTags?.length) {
    const set = new Set(filters.excludeTags);
    out = out.filter((m) => !(m.tags || []).some((t) => set.has(t?.name)));
  }

  if (filters.q) {
    const q = String(filters.q).toLowerCase();
    out = out.filter((m) => String(m.title?.userPreferred || '').toLowerCase().includes(q));
  }

  const sliceStart = start % pageSize;
  out = out.slice(sliceStart, sliceStart + filters.limit);

  return {
    key,
    total: total ?? 0,
    rows: out.map((m) => mapMediaToRow(m, y, filters.season))
  };
}

export async function refreshCatalog(year, season, requestId = 'system') {
  const y = toYearInt(year);
  if (!y) throw new Error('Invalid year');

  const key = cacheKey(y, season);
  const ttl = ttlBySeason(season);

  const existing = db.prepare('SELECT * FROM cache_keys WHERE cache_key=?').get(key);
  const now = Date.now();

  if (
    existing?.refreshing &&
    existing.refreshStartedAt &&
    now - new Date(existing.refreshStartedAt).getTime() < config.refreshStuckSeconds * 1000
  ) {
    return { started: false, reason: 'already_refreshing' };
  }

  db.prepare(
    `INSERT INTO cache_keys(cache_key, ttlSeconds, refreshing, refreshStartedAt, lastError) VALUES(?,?,?,?,NULL)
     ON CONFLICT(cache_key) DO UPDATE SET refreshing=1, refreshStartedAt=excluded.refreshStartedAt, ttlSeconds=excluded.ttlSeconds`
  ).run(key, ttl, 1, nowIso());

  try {
    const query = getPageQuery(season);

    // Some AniList deployments hide adult entries unless explicitly requested.
    // We refresh both non-adult and adult-only pages and merge them.
    const adultModes = [false, true];
    const pages = [];

    for (const isAdult of adultModes) {
      let page = 1;
      while (true) {
        const vars =
          season === 'ALL'
            ? {
                startGreater: y * 10000,
                startLesser: (y + 1) * 10000,
                page,
                perPage: 50,
                formatIn: FORMATS,
                statusIn: MEDIA_STATUSES,
                isAdult
              }
            : { seasonYear: y, season, page, perPage: 50, formatIn: FORMATS, statusIn: MEDIA_STATUSES, isAdult };

        const resp = await anilistRequest({ query, variables: vars, requestId });

        if (resp.error) {
          const msg = resp.details?.[0]?.message;
          throw new Error(msg ? `${resp.error}: ${msg}` : resp.error);
        }

        const pageData = resp.data.Page;
        pages.push(...pageData.media);

        if (!pageData.pageInfo.hasNextPage) break;
        page += 1;
      }
    }

    // de-dupe merged pages
    const byId = new Map();
    for (const m of pages) byId.set(m.id, m);
    const mergedPages = [...byId.values()];

    const tx = db.transaction((items) => {
      const upsertMedia = db.prepare(
        `INSERT INTO media(
           id,year,season,title,description,siteUrl,coverLarge,averageScore,popularity,format,status,isAdult,updatedAt,genres_json
         ) VALUES(
           @id,@year,@season,@title,@description,@siteUrl,@coverLarge,@averageScore,@popularity,@format,@status,@isAdult,@updatedAt,@genres_json
         )
         ON CONFLICT(id) DO UPDATE SET
           year=excluded.year,
           season=excluded.season,
           title=excluded.title,
           description=excluded.description,
           siteUrl=excluded.siteUrl,
           coverLarge=excluded.coverLarge,
           averageScore=excluded.averageScore,
           popularity=excluded.popularity,
           format=excluded.format,
           status=excluded.status,
           isAdult=excluded.isAdult,
           updatedAt=excluded.updatedAt,
           genres_json=excluded.genres_json`
      );

      const delGenres = db.prepare('DELETE FROM media_genres WHERE media_id=?');
      const insGenre = db.prepare('INSERT OR IGNORE INTO media_genres(media_id, genre) VALUES(?,?)');

      const delTags = db.prepare('DELETE FROM media_tags WHERE media_id=?');
      const insTag = db.prepare(
        'INSERT OR REPLACE INTO media_tags(media_id, tag_name, rank, category, isAdult, isSpoiler) VALUES(?,?,?,?,?,?)'
      );

      for (const item of items) {
        upsertMedia.run({
          id: item.id,
          year: item.seasonYear || y,
          season: item.season || season,
          title: item.title?.userPreferred || '',
          description: item.description || null,
          siteUrl: item.siteUrl,
          coverLarge: item.coverImage?.large || null,
          averageScore: item.averageScore || null,
          popularity: item.popularity || null,
          format: item.format,
          status: item.status,
          isAdult: item.isAdult ? 1 : 0,
          updatedAt: nowIso(),
          genres_json: JSON.stringify(item.genres || [])
        });

        delGenres.run(item.id);
        for (const g of item.genres || []) insGenre.run(item.id, g);

        delTags.run(item.id);
        for (const t of item.tags || []) {
          if ((t.rank || 0) >= config.tagRankThreshold) {
            insTag.run(
              item.id,
              t.name,
              t.rank || 0,
              t.category || null,
              t.isAdult ? 1 : 0,
              t.isMediaSpoiler ? 1 : 0
            );
          }
        }
      }
    });

    tx(mergedPages);

    // mark has_prequel
    const ids = mergedPages.map((m) => m.id);
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const resp = await anilistRequest({ query: relationQuery, variables: { ids: chunk }, requestId });
      if (resp.error) continue;

      for (const media of resp.data.Page.media || []) {
        const hasPrequel = media.relations?.edges?.some((e) => e.relationType === 'PREQUEL');
        db.prepare('UPDATE media SET has_prequel=? WHERE id=?').run(hasPrequel ? 1 : 0, media.id);
      }
    }

    db.prepare('UPDATE cache_keys SET refreshing=0, updatedAt=?, ttlSeconds=?, lastError=NULL WHERE cache_key=?').run(
      nowIso(),
      ttl,
      key
    );

    return { started: true };
  } catch (error) {
    db.prepare('UPDATE cache_keys SET refreshing=0, lastError=? WHERE cache_key=?').run(String(error.message || error), key);
    return { started: true, failed: true };
  }
}

export function ensureCatalogSWR(year, season, requestId) {
  const meta = getCatalogCacheMeta(year, season);
  if (meta.stale || !meta.updatedAt) {
    refreshCatalog(year, season, requestId).catch(() => {});
  }
  return meta;
}

export async function lazyFetchTitle(id, requestId) {
  const existing = db.prepare('SELECT * FROM media WHERE id=?').get(id);
  if (existing) return existing;

  const query = `
query($id:Int){
  Media(id:$id,type:ANIME){
    id title{userPreferred} description(asHtml:true) siteUrl coverImage{large}
    averageScore popularity format status isAdult season seasonYear genres
    tags{name rank category isAdult isMediaSpoiler}
  }
}`;

  const resp = await anilistRequest({ query, variables: { id }, requestId });

  if (resp.error) {
    const msg = resp.details?.[0]?.message;
    throw new Error(msg ? `${resp.error}: ${msg}` : resp.error);
  }

  if (!resp.data?.Media) return null;
  const m = resp.data.Media;

  const tx = db.transaction((media) => {
    db.prepare(
      `INSERT OR REPLACE INTO media(
         id,year,season,title,description,siteUrl,coverLarge,averageScore,popularity,format,status,isAdult,updatedAt,genres_json
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      media.id,
      media.seasonYear || new Date().getFullYear(),
      media.season || 'ALL',
      media.title?.userPreferred || '',
      media.description || null,
      media.siteUrl,
      media.coverImage?.large || null,
      media.averageScore || null,
      media.popularity || null,
      media.format || null,
      media.status || null,
      media.isAdult ? 1 : 0,
      nowIso(),
      JSON.stringify(media.genres || [])
    );

    db.prepare('DELETE FROM media_genres WHERE media_id=?').run(media.id);
    const insGenre = db.prepare('INSERT OR IGNORE INTO media_genres(media_id, genre) VALUES(?,?)');
    for (const g of media.genres || []) insGenre.run(media.id, g);

    db.prepare('DELETE FROM media_tags WHERE media_id=?').run(media.id);
    const insTag = db.prepare(
      'INSERT OR REPLACE INTO media_tags(media_id, tag_name, rank, category, isAdult, isSpoiler) VALUES(?,?,?,?,?,?)'
    );

    for (const t of media.tags || []) {
      if ((t.rank || 0) >= config.tagRankThreshold) {
        insTag.run(media.id, t.name, t.rank || 0, t.category || null, t.isAdult ? 1 : 0, t.isMediaSpoiler ? 1 : 0);
      }
    }
  });

  tx(m);
  return db.prepare('SELECT * FROM media WHERE id=?').get(id);
}
