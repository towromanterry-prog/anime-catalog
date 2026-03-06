// src/utils/catalog.js
import { FORMATS, MEDIA_STATUSES, SEASONS, USER_STATUSES } from '../config.js';
import { badRequest } from './errors.js';

const MAX_MULTI = 20;

function asArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

function validateEnumList(name, values, allowed, max = MAX_MULTI) {
  if (values.length > max) throw badRequest(`${name} max ${max}`);
  const invalid = values.filter((item) => !allowed.includes(item));
  if (invalid.length) throw badRequest(`Invalid ${name}`, { invalid });
}

function validateTextList(name, values, { maxItems, maxLen = 64 } = {}) {
  if (values.length > maxItems) throw badRequest(`${name} max ${maxItems}`);
  const tooLong = values.filter((s) => String(s).length > maxLen);
  if (tooLong.length) throw badRequest(`${name} item max length ${maxLen}`);
}

export function parseCatalogQuery(query) {
  // Be tolerant to different query parsers / proxies.
  // Express usually gives strings; some clients may send booleans or 1/0.
  const asBool = (v) => {
    if (v === true || v === 1) return true;
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on';
  };

  const year = Number(query.year || new Date().getFullYear());
  const season = (query.season || 'ALL').toUpperCase();
  if (!SEASONS.includes(season)) throw badRequest('Invalid season');

  const offset = Math.max(0, Number(query.offset || 0));
  const limit = Math.min(80, Math.max(1, Number(query.limit || 40)));

  // Defaults from SPEC.md
  const statusRaw = asArray(query.status);
  const formatRaw = asArray(query.format);
  const status = statusRaw.length ? statusRaw : ['RELEASING', 'FINISHED'];
  const format = formatRaw.length ? formatRaw : ['TV', 'ONA'];

  // Genre/tag filters
  const includeGenres = asArray(query.includeGenres);
  const excludeGenres = asArray(query.excludeGenres);
  const includeTags = asArray(query.includeTags);
  const excludeTags = asArray(query.excludeTags);

  const myStatus = asArray(query.myStatus);

  const q = String(query.q || '').trim();
  if (q.length > 64) throw badRequest('q max length is 64');

  // Average score filter (0..100). 0 disables the filter.
  const minScoreRaw = query.minScore;
  const minScore = minScoreRaw == null || minScoreRaw === '' ? 0 : Number(minScoreRaw);
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) throw badRequest('minScore must be 0..100');

  validateEnumList('status', status, MEDIA_STATUSES);
  validateEnumList('format', format, FORMATS);
  validateEnumList('myStatus', myStatus, USER_STATUSES);

  // Query budgets from SPEC.md (14.3) + parity for include*
  validateTextList('excludeTags', excludeTags, { maxItems: 50 });
  validateTextList('excludeGenres', excludeGenres, { maxItems: 20 });
  validateTextList('includeTags', includeTags, { maxItems: 50 });
  validateTextList('includeGenres', includeGenres, { maxItems: 20 });

  const adult = asBool(query.adult);
  const strictMatch = asBool(query.strictMatch);
  const onlyNew = asBool(query.onlyNew);
  const onlySequels = asBool(query.onlySequels);
  const notInMyList = asBool(query.notInMyList);
  const watchLaterOnly = asBool(query.watchLaterOnly);
  const showHidden = asBool(query.showHidden);

  const sort = query.sort || 'score_desc';
  const sortMap = {
    score_desc: 'm.averageScore DESC, m.id ASC',
    score_asc: 'm.averageScore ASC, m.id ASC',
    popularity_desc: 'm.popularity DESC, m.id ASC',
    popularity_asc: 'm.popularity ASC, m.id ASC',
    id_desc: 'm.id DESC',
    id_asc: 'm.id ASC'
  };
  if (!sortMap[sort]) throw badRequest('Invalid sort');

  return {
    year,
    season,
    offset,
    limit,
    q,
    minScore: Math.trunc(minScore),
    status,
    format,
    includeGenres,
    excludeGenres,
    includeTags,
    excludeTags,
    strictMatch,
    adult,
    onlyNew,
    onlySequels,
    sort,
    orderBy: sortMap[sort],
    myStatus,
    notInMyList,
    watchLaterOnly,
    showHidden
  };
}

export function cacheKey(year, season) {
  return `y:${year}:s:${season}`;
}

export function ttlBySeason(year, season) {
  const currentYear = new Date().getFullYear();
  if (year <= currentYear - 1) return 315360000;
  return season === 'ALL' ? 259200 : 172800;
}
