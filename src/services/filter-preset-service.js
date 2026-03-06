import crypto from 'node:crypto';
import { parseCatalogQuery } from '../utils/catalog.js';

const DEFAULT_STATUS = ['RELEASING', 'FINISHED'];
const DEFAULT_FORMAT = ['TV', 'ONA'];
const DEFAULT_SORT = 'score_desc';
const DEFAULT_LIMIT = 40;

function uniqSorted(arr, { max = 50 } = {}) {
  const out = [];
  const seen = new Set();
  for (const v of Array.isArray(arr) ? arr : []) {
    const s = String(v || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out.slice(0, max);
}

function equalList(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function isPresetObject(obj) {
  return !!obj && typeof obj === 'object' && Number(obj.v) >= 1 && obj.patch && typeof obj.patch === 'object';
}

export function normalizePresetObject(obj) {
  if (!isPresetObject(obj)) return null;
  const patch = obj.patch || {};
  // Keep it minimal: ensure it's an object; deeper validation is done by hash normalization.
  return { v: 1, patch };
}

export function buildPresetFromLegacyQuery(queryObj) {
  const nowYear = new Date().getFullYear();
  let full = null;
  try {
    full = parseCatalogQuery(queryObj || {});
  } catch {
    // best-effort salvage
    const y = Number(queryObj?.year || nowYear);
    const s = String(queryObj?.season || 'ALL').toUpperCase();
    full = {
      year: Number.isFinite(y) ? y : nowYear,
      season: s || 'ALL',
      q: String(queryObj?.q || '').trim(),
      minScore: Number(queryObj?.minScore || 0),
      status: Array.isArray(queryObj?.status) ? queryObj.status : String(queryObj?.status || '').split(',').filter(Boolean),
      format: Array.isArray(queryObj?.format) ? queryObj.format : String(queryObj?.format || '').split(',').filter(Boolean),
      includeGenres: Array.isArray(queryObj?.includeGenres) ? queryObj.includeGenres : String(queryObj?.includeGenres || '').split(',').filter(Boolean),
      excludeGenres: Array.isArray(queryObj?.excludeGenres) ? queryObj.excludeGenres : String(queryObj?.excludeGenres || '').split(',').filter(Boolean),
      includeTags: Array.isArray(queryObj?.includeTags) ? queryObj.includeTags : String(queryObj?.includeTags || '').split(',').filter(Boolean),
      excludeTags: Array.isArray(queryObj?.excludeTags) ? queryObj.excludeTags : String(queryObj?.excludeTags || '').split(',').filter(Boolean),
      strictMatch: queryObj?.strictMatch === true || queryObj?.strictMatch === 'true',
      adult: queryObj?.adult === true || queryObj?.adult === 'true',
      onlyNew: queryObj?.onlyNew === true || queryObj?.onlyNew === 'true',
      onlySequels: queryObj?.onlySequels === true || queryObj?.onlySequels === 'true',
      sort: String(queryObj?.sort || DEFAULT_SORT),
      limit: Number(queryObj?.limit || DEFAULT_LIMIT),
      myStatus: Array.isArray(queryObj?.myStatus) ? queryObj.myStatus : String(queryObj?.myStatus || '').split(',').filter(Boolean),
      notInMyList: queryObj?.notInMyList === true || queryObj?.notInMyList === 'true',
      watchLaterOnly: queryObj?.watchLaterOnly === true || queryObj?.watchLaterOnly === 'true',
      showHidden: queryObj?.showHidden === true || queryObj?.showHidden === 'true'
    };
  }

  // Canonicalize lists for stable hashing and dedup.
  const status = uniqSorted(full.status, { max: 20 });
  const format = uniqSorted(full.format, { max: 20 });
  const includeGenres = uniqSorted(full.includeGenres, { max: 20 });
  const excludeGenres = uniqSorted(full.excludeGenres, { max: 20 });
  const includeTags = uniqSorted(full.includeTags, { max: 50 });
  const excludeTags = uniqSorted(full.excludeTags, { max: 50 });
  const myStatus = uniqSorted(full.myStatus, { max: 20 });

  const patch = {
    year: Number(full.year) || nowYear,
    season: String(full.season || 'ALL').toUpperCase()
  };

  const q = String(full.q || '').trim();
  if (q) patch.q = q.slice(0, 64);

  if (status.length && !equalList(status, DEFAULT_STATUS.slice().sort())) patch.status = status;
  if (format.length && !equalList(format, DEFAULT_FORMAT.slice().sort())) patch.format = format;

  const adult = !!full.adult;
  if (adult) patch.adult = true;

  const minScore = Number(full.minScore || 0);
  if (Number.isFinite(minScore) && minScore > 0) patch.minScore = Math.max(0, Math.min(100, Math.trunc(minScore)));

  if (includeGenres.length) patch.includeGenres = includeGenres;
  if (includeTags.length) patch.includeTags = includeTags;
  if (excludeGenres.length) patch.excludeGenres = excludeGenres;
  if (excludeTags.length) patch.excludeTags = excludeTags;

  if (full.strictMatch) patch.strictMatch = true;

  if (full.onlyNew) patch.onlyNew = true;
  if (full.onlySequels) patch.onlySequels = true;

  if (String(full.sort || DEFAULT_SORT) !== DEFAULT_SORT) patch.sort = String(full.sort);
  if (Number(full.limit || DEFAULT_LIMIT) !== DEFAULT_LIMIT) patch.limit = Math.max(1, Math.min(80, Number(full.limit)));

  if (myStatus.length) patch.myStatus = myStatus;
  if (full.notInMyList) patch.notInMyList = true;
  if (full.watchLaterOnly) patch.watchLaterOnly = true;
  if (full.showHidden) patch.showHidden = true;

  return { v: 1, patch };
}

function stableStringify(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number' || t === 'boolean') return JSON.stringify(value);
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(String(value));
}

export function presetHash(preset) {
  const p = isPresetObject(preset) ? preset : normalizePresetObject(preset);
  if (!p) return null;
  const canon = stableStringify(p.patch || {});
  return crypto.createHash('sha256').update(canon).digest('hex');
}
