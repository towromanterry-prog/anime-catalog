// web/src/filters/model.js
// Canonical filters + URL serialization for v0.4 presets.

export const FILTER_PRESET_VERSION = 1;

// These defaults are from docs/SPEC.md (section 3.1).
export const DEFAULT_FORMAT = ['TV', 'ONA'];
export const DEFAULT_STATUS = ['RELEASING', 'FINISHED'];
export const DEFAULT_SORT = 'score_desc';
export const DEFAULT_LIMIT = 40;

// Query budgets from SPEC.md (section 14.3)
export const LIMIT_MAX = 80;
export const EXCLUDE_TAGS_MAX = 50;
export const EXCLUDE_GENRES_MAX = 20;
export const INCLUDE_TAGS_MAX = 50;
export const INCLUDE_GENRES_MAX = 20;
export const MULTI_MAX = 20;
export const Q_MAX_LEN = 64;

const KEY_ORDER = [
  'q',
  'year',
  'season',
  'status',
  'format',
  'minScore',
  'adult',
  'includeGenres',
  'includeTags',
  'excludeGenres',
  'excludeTags',
  'onlyNew',
  'onlySequels',
  'sort',
  'limit',
  'myStatus',
  'notInMyList',
  'watchLaterOnly',
  'showHidden',
  'offset'
];

function nowYear(now = new Date()) {
  return now.getFullYear();
}

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr) {
    const s = String(v).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function asStr(v, fallback = '') {
  if (v == null) return fallback;
  if (Array.isArray(v)) return asStr(v[0], fallback);
  return String(v);
}

function asBool(v, fallback = false) {
  const s = asStr(v, '');
  if (!s) return fallback;
  return s === 'true' || s === '1';
}

function asCsvList(v) {
  if (v == null) return [];
  if (Array.isArray(v)) {
    // Vue Router may store multi params as arrays.
    // Accept both array and CSV-in-a-single-string.
    if (v.length === 1 && String(v[0] || '').includes(',')) {
      return String(v[0] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return v.map((x) => String(x).trim()).filter(Boolean);
  }
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function stableSort(arr) {
  return [...arr].sort((a, b) => a.localeCompare(b));
}

function equalList(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function makeDefaultFilters({ now = new Date() } = {}) {
  return {
    // UI defaults (SPEC doesn't pin a default year/season).
    year: nowYear(now),
    season: 'ALL',

    status: [...DEFAULT_STATUS],
    format: [...DEFAULT_FORMAT],
    minScore: 0,
    adult: false,
    includeGenres: [],
    includeTags: [],
    excludeGenres: [],
    excludeTags: [],
    onlyNew: false,
    onlySequels: false,
    sort: DEFAULT_SORT,
    offset: 0,
    limit: DEFAULT_LIMIT,

    // user-only
    myStatus: [],
    notInMyList: false,
    watchLaterOnly: false,
    showHidden: false,

    // search
    q: ''
  };
}

export function normalizeFilters(input, { now = new Date() } = {}) {
  const d = makeDefaultFilters({ now });
  const f = { ...d, ...(input || {}) };

  // year
  f.year = clampInt(f.year, 1900, 3000, d.year);
  // season
  f.season = String(f.season || 'ALL').toUpperCase();
  if (!['WINTER', 'SPRING', 'SUMMER', 'FALL', 'ALL'].includes(f.season)) f.season = 'ALL';

  // paging
  f.offset = clampInt(f.offset, 0, Number.MAX_SAFE_INTEGER, 0);
  f.limit = clampInt(f.limit, 1, LIMIT_MAX, DEFAULT_LIMIT);

  // average score filter
  f.minScore = clampInt(f.minScore, 0, 100, 0);

  // search
  f.q = String(f.q || '').trim().slice(0, Q_MAX_LEN);

  // multi
  f.status = stableSort(uniq(asCsvList(f.status))).slice(0, MULTI_MAX);
  f.format = stableSort(uniq(asCsvList(f.format))).slice(0, MULTI_MAX);
  f.includeGenres = stableSort(uniq(asCsvList(f.includeGenres))).slice(0, INCLUDE_GENRES_MAX);
  f.includeTags = stableSort(uniq(asCsvList(f.includeTags))).slice(0, INCLUDE_TAGS_MAX);
  f.excludeGenres = stableSort(uniq(asCsvList(f.excludeGenres))).slice(0, EXCLUDE_GENRES_MAX);
  f.excludeTags = stableSort(uniq(asCsvList(f.excludeTags))).slice(0, EXCLUDE_TAGS_MAX);
  f.myStatus = stableSort(uniq(asCsvList(f.myStatus))).slice(0, MULTI_MAX);

  // defaults if empty
  if (!f.status.length) f.status = [...DEFAULT_STATUS];
  if (!f.format.length) f.format = [...DEFAULT_FORMAT];

  // booleans
  f.adult = !!f.adult;
  f.onlyNew = !!f.onlyNew;
  f.onlySequels = !!f.onlySequels;
  f.notInMyList = !!f.notInMyList;
  f.watchLaterOnly = !!f.watchLaterOnly;
  f.showHidden = !!f.showHidden;

  // mutual exclusivity (practical)
  if (f.onlyNew && f.onlySequels) f.onlySequels = false;

  // sort
  const allowedSort = new Set([
    'score_desc',
    'score_asc',
    'popularity_desc',
    'popularity_asc',
    'id_desc',
    'id_asc'
  ]);
  f.sort = allowedSort.has(String(f.sort || DEFAULT_SORT)) ? String(f.sort) : DEFAULT_SORT;

  return f;
}

export function parseQueryToFilters(query, { now = new Date() } = {}) {
  const d = makeDefaultFilters({ now });
  const q = query || {};

  const out = {
    q: asStr(q.q, ''),
    year: clampInt(asStr(q.year, ''), 1900, 3000, d.year),
    season: asStr(q.season, d.season).toUpperCase(),
    status: asCsvList(q.status),
    format: asCsvList(q.format),
    minScore: clampInt(asStr(q.minScore, ''), 0, 100, 0),
    adult: asBool(q.adult, false),
    includeGenres: asCsvList(q.includeGenres),
    includeTags: asCsvList(q.includeTags),
    excludeGenres: asCsvList(q.excludeGenres),
    excludeTags: asCsvList(q.excludeTags),
    onlyNew: asBool(q.onlyNew, false),
    onlySequels: asBool(q.onlySequels, false),
    sort: asStr(q.sort, DEFAULT_SORT),
    offset: clampInt(asStr(q.offset, ''), 0, Number.MAX_SAFE_INTEGER, 0),
    limit: clampInt(asStr(q.limit, ''), 1, LIMIT_MAX, DEFAULT_LIMIT),

    myStatus: asCsvList(q.myStatus),
    notInMyList: asBool(q.notInMyList, false),
    watchLaterOnly: asBool(q.watchLaterOnly, false),
    showHidden: asBool(q.showHidden, false)
  };

  return normalizeFilters(out, { now });
}

function toCsv(arr) {
  return arr.join(',');
}

function dropDefaults(filters, { now = new Date() } = {}) {
  const d = normalizeFilters(makeDefaultFilters({ now }), { now });
  const f = normalizeFilters(filters, { now });

  const out = {};

  // Always include year to make links stable across time.
  out.year = String(f.year);

  // season: omit ALL
  if (f.season && f.season !== 'ALL') out.season = f.season;

  if (f.q) out.q = f.q;

  if (!equalList(f.status, d.status)) out.status = toCsv(f.status);
  if (!equalList(f.format, d.format)) out.format = toCsv(f.format);

  if (f.minScore && f.minScore !== 0) out.minScore = String(f.minScore);

  if (f.adult) out.adult = 'true';

  if (f.includeGenres.length) out.includeGenres = toCsv(f.includeGenres);
  if (f.includeTags.length) out.includeTags = toCsv(f.includeTags);

  if (f.excludeGenres.length) out.excludeGenres = toCsv(f.excludeGenres);
  if (f.excludeTags.length) out.excludeTags = toCsv(f.excludeTags);

  if (f.onlyNew) out.onlyNew = 'true';
  if (f.onlySequels) out.onlySequels = 'true';

  if (f.sort && f.sort !== DEFAULT_SORT) out.sort = f.sort;
  if (f.limit !== DEFAULT_LIMIT) out.limit = String(f.limit);

  if (f.myStatus.length) out.myStatus = toCsv(f.myStatus);
  if (f.notInMyList) out.notInMyList = 'true';
  if (f.watchLaterOnly) out.watchLaterOnly = 'true';
  if (f.showHidden) out.showHidden = 'true';

  // offset: keep for stable paging UI.
  out.offset = String(f.offset || 0);

  return out;
}

export function filtersToQuery(filters, { now = new Date(), keepOffset = true } = {}) {
  const base = dropDefaults(filters, { now });
  if (!keepOffset) delete base.offset;

  for (const [k, v] of Object.entries(base)) {
    if (v == null || v === '') delete base[k];
  }

  const ordered = {};
  for (const k of KEY_ORDER) {
    if (base[k] != null) ordered[k] = base[k];
  }
  for (const k of Object.keys(base)) {
    if (ordered[k] == null) ordered[k] = base[k];
  }
  return ordered;
}

export function buildPresetPatch(filters, { now = new Date() } = {}) {
  const f = normalizeFilters(filters, { now });
  const d = normalizeFilters(makeDefaultFilters({ now }), { now });

  const patch = {
    // We always capture year; it would be surprising if a preset "drifts" next year.
    year: f.year,
    // Capture season too (even ALL is ok).
    season: f.season
  };

  if (f.q) patch.q = f.q;

  if (!equalList(f.status, d.status)) patch.status = [...f.status];
  if (!equalList(f.format, d.format)) patch.format = [...f.format];
  if (f.minScore !== d.minScore) patch.minScore = f.minScore;
  if (f.adult !== d.adult) patch.adult = f.adult;

  if (f.includeGenres.length) patch.includeGenres = [...f.includeGenres];
  if (f.includeTags.length) patch.includeTags = [...f.includeTags];

  if (f.excludeGenres.length) patch.excludeGenres = [...f.excludeGenres];
  if (f.excludeTags.length) patch.excludeTags = [...f.excludeTags];

  if (f.onlyNew) patch.onlyNew = true;
  if (f.onlySequels) patch.onlySequels = true;

  if (f.sort !== d.sort) patch.sort = f.sort;
  if (f.limit !== d.limit) patch.limit = f.limit;

  if (f.myStatus.length) patch.myStatus = [...f.myStatus];
  if (f.notInMyList) patch.notInMyList = true;
  if (f.watchLaterOnly) patch.watchLaterOnly = true;
  if (f.showHidden) patch.showHidden = true;

  // offset is never persisted.
  return patch;
}

export function applyPresetPatch(patch, { now = new Date() } = {}) {
  const d = makeDefaultFilters({ now });
  const merged = { ...d, ...(patch || {}), offset: 0 };
  return normalizeFilters(merged, { now });
}

export function isPresetObject(obj) {
  return !!obj && typeof obj === 'object' && Number(obj.v) >= 1 && obj.patch && typeof obj.patch === 'object';
}

// Accept legacy shapes:
// - {name, filters: { ...route.query }}
// - {name, preset: {v, patch}}
export function migrateToPresetRecord(record, { now = new Date() } = {}) {
  if (!record || typeof record !== 'object') return null;
  const name = String(record.name || '').trim();
  if (!name) return null;

  const rawPreset = record.preset;
  if (isPresetObject(rawPreset)) {
    return { v: FILTER_PRESET_VERSION, name, patch: rawPreset.patch };
  }

  // Legacy "filters" stored as route.query object.
  const legacyFilters = record.filters;
  if (legacyFilters && typeof legacyFilters === 'object') {
    const full = parseQueryToFilters(legacyFilters, { now });
    const patch = buildPresetPatch(full, { now });
    return { v: FILTER_PRESET_VERSION, name, patch };
  }

  // Legacy: stored directly as {v, patch, name}.
  if (record.patch && typeof record.patch === 'object') {
    return { v: FILTER_PRESET_VERSION, name, patch: record.patch };
  }
  return null;
}
