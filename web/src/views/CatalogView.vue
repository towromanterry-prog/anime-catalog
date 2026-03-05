<template>
  <div class="grid">
    <section class="card">
      <div class="hd">Фильтры</div>
      <div class="bd">
        <div class="field">
          <label>Пресеты</label>
          <select :value="selectedPreset" @change="onPreset">
            <option value="">—</option>
            <option v-for="p in builtinPresets" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <div class="muted" style="font-size:12px">Пресеты применяют набор фильтров и обновляют ссылку.</div>
        </div>

        <div class="field">
          <label>Поиск по названию</label>
          <input
            :value="state.q"
            placeholder="например: Naruto"
            @input="onQuery"
          />
        </div>

        <div class="field">
          <label>Год</label>
          <input type="number" :value="state.year" min="1900" max="3000" @change="onYear" />
        </div>

        <div class="field">
          <label>Сезон</label>
          <select :value="state.season" @change="onSeason">
            <option v-for="s in meta.seasons" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <div class="field">
          <label>Сортировка</label>
          <select :value="state.sort" @change="onSort">
            <option value="score_desc">Score ↓</option>
            <option value="score_asc">Score ↑</option>
            <option value="popularity_desc">Popularity ↓</option>
            <option value="popularity_asc">Popularity ↑</option>
            <option value="id_desc">ID ↓</option>
            <option value="id_asc">ID ↑</option>
          </select>
        </div>

        <div class="field">
          <label>Мин. оценка (averageScore)</label>
          <div class="row" style="gap:10px; align-items:center">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              :value="state.minScore"
              @input="onMinScore"
              style="flex:1"
            />
            <input
              type="number"
              min="0"
              max="100"
              :value="state.minScore"
              @change="onMinScore"
              style="width:78px"
            />
          </div>
          <div class="muted" style="font-size:12px">0 — без фильтра.</div>
        </div>

        <div class="field">
          <label>Форматы</label>
          <div class="row">
            <label v-for="f in meta.formats" :key="f" class="chip" style="cursor:pointer">
              <input type="checkbox" :checked="state.format.includes(f)" @change="toggleMulti('format', f)" />
              <span>{{ f }}</span>
            </label>
          </div>
          <div class="muted" style="font-size:12px">По умолчанию: TV + ONA</div>
        </div>

        <div class="field">
          <label>Статусы</label>
          <div class="row">
            <label v-for="s in meta.statuses" :key="s" class="chip" style="cursor:pointer">
              <input type="checkbox" :checked="state.status.includes(s)" @change="toggleMulti('status', s)" />
              <span>{{ s }}</span>
            </label>
          </div>
          <div class="muted" style="font-size:12px">По умолчанию: RELEASING + FINISHED</div>
        </div>

        <div class="field">
          <label>
            <input type="checkbox" :checked="state.adult" @change="onToggle('adult')" />
            Adult
          </label>
          <div class="muted" style="font-size:12px">Показывать 18+ тайтлы (если они есть в кеше).</div>
        </div>

        <div class="field">
          <label>
            <input type="checkbox" :checked="state.onlyNew" @change="onToggle('onlyNew')" />
            Только новые (без приквела)
          </label>
          <label>
            <input type="checkbox" :checked="state.onlySequels" @change="onToggle('onlySequels')" />
            Только продолжения (есть приквел)
          </label>
        </div>

        <div class="field">
          <label>Жанры (включить)</label>
          <select multiple size="6" :value="state.includeGenres" @change="onIncludeGenres">
            <option v-for="g in meta.genres" :key="g" :value="g">{{ g }}</option>
          </select>
          <div class="muted" style="font-size:12px">Показывать тайтлы, где есть любой из выбранных жанров.</div>
        </div>

        <div class="field">
          <label>Исключить жанры</label>
          <select multiple size="6" :value="state.excludeGenres" @change="onExcludeGenres">
            <option v-for="g in meta.genres" :key="g" :value="g">{{ g }}</option>
          </select>
        </div>

        <div class="field">
          <label>Теги (включить)</label>
          <div class="row" style="margin-bottom:8px">
            <span v-for="t in state.includeTags" :key="t" class="chip">
              {{ t }}
              <button title="Удалить" @click="removeIncludeTag(t)">×</button>
            </span>
          </div>
          <div class="dropdown">
            <input
              v-model="includeTagInput"
              placeholder="Начните вводить…"
              @keydown.enter.prevent="addIncludeTag(includeTagInput)"
              @focus="includeTagFocused = true"
              @blur="onIncludeTagBlur"
            />
            <div v-if="includeTagFocused && includeTagSuggest.data.value?.data?.length" class="menu">
              <button
                v-for="t in includeTagSuggest.data.value.data"
                :key="t"
                type="button"
                @mousedown.prevent="addIncludeTag(t)"
              >
                {{ t }}
              </button>
            </div>
          </div>
          <div class="muted" style="font-size:12px">Enter — добавить тег. Показать тайтлы, где есть любой из выбранных тегов.</div>
        </div>

        <div class="field">
          <label>Исключить теги</label>
          <div class="row" style="margin-bottom:8px">
            <span v-for="t in state.excludeTags" :key="t" class="chip">
              {{ t }}
              <button title="Удалить" @click="removeExcludeTag(t)">×</button>
            </span>
          </div>
          <div class="dropdown">
            <input
              v-model="tagInput"
              placeholder="Начните вводить…"
              @keydown.enter.prevent="addExcludeTag(tagInput)"
              @focus="tagFocused = true"
              @blur="onTagBlur"
            />
            <div v-if="tagFocused && tagSuggest.data.value?.data?.length" class="menu">
              <button
                v-for="t in tagSuggest.data.value.data"
                :key="t"
                type="button"
                @mousedown.prevent="addExcludeTag(t)"
              >
                {{ t }}
              </button>
            </div>
          </div>
          <div class="muted" style="font-size:12px">Enter — добавить тег.</div>
        </div>

        <div v-if="me" class="field">
          <label>Мои фильтры</label>
          <div class="row">
            <label v-for="s in meta.userStatuses" :key="s" class="chip" style="cursor:pointer">
              <input type="checkbox" :checked="state.myStatus.includes(s)" @change="toggleMulti('myStatus', s)" />
              <span>{{ s }}</span>
            </label>
          </div>
          <label style="margin-top:8px">
            <input type="checkbox" :checked="state.notInMyList" @change="onToggle('notInMyList')" />
            Не в моём списке
          </label>
          <label>
            <input type="checkbox" :checked="state.watchLaterOnly" @change="onToggle('watchLaterOnly')" />
            Только «посмотреть позже»
          </label>
          <label>
            <input type="checkbox" :checked="state.showHidden" @change="onToggle('showHidden')" />
            Показывать скрытые
          </label>
        </div>

        <div class="field">
          <label>Пагинация</label>
          <div class="row">
            <span class="muted" style="font-size:12px">limit</span>
            <select :value="state.limit" @change="onLimit">
              <option :value="20">20</option>
              <option :value="40">40</option>
              <option :value="60">60</option>
              <option :value="80">80</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label>Сохранённые фильтры</label>
          <div class="row">
            <input v-model="presetName" placeholder="Название пресета" />
            <button class="btn" type="button" @click="savePreset" :disabled="!presetName.trim()">Сохранить</button>
          </div>
          <div v-if="savedPresets.length" class="presetList">
            <div v-for="p in savedPresets" :key="p.id" class="presetItem">
              <template v-if="isRenaming(p)">
                <input
                  v-model="renameDraft"
                  class="presetInput"
                  placeholder="Название"
                  @keydown.enter.prevent="confirmRenamePreset(p)"
                  @keydown.esc.prevent="cancelRename"
                />
                <div class="presetActions">
                  <button class="miniBtn" type="button" title="Сохранить" @click="confirmRenamePreset(p)">✓</button>
                  <button class="miniBtn" type="button" title="Отмена" @click="cancelRename">×</button>
                </div>
              </template>
              <template v-else>
                <button class="presetName" type="button" @click="loadPreset(p)" :title="`Применить: ${p.name}`">
                  {{ p.name }}
                </button>
                <div class="presetActions">
                  <button class="miniBtn" type="button" title="Переименовать" @click="startRename(p)">✎</button>
                  <button class="miniBtn danger" type="button" title="Удалить" @click="confirmDeletePreset(p)">✕</button>
                </div>
              </template>
            </div>
          </div>

          <div class="muted" style="font-size:12px">
            Гость: сохраняется в браузере. После входа: сохраняется на сервере.
          </div>
        </div>

        <div class="row" style="justify-content:flex-start; gap:8px; align-items:center">
          <button class="btn" type="button" @click="reset">Сбросить</button>
          <button
            class="btn"
            type="button"
            @click="onSync"
            :disabled="syncMut.isPending.value || !me"
            :title="me ? 'Обновить список из AniList' : 'Войдите через AniList, чтобы синхронизировать'"
          >
            Синхронизировать
          </button>
          <span v-if="syncMut.isPending.value" class="muted" style="font-size:12px">…</span>
          <span v-else-if="syncNote" class="muted" style="font-size:12px">{{ syncNote }}</span>
        </div>
      </div>
    </section>

    <section>
      <div v-if="catalogQuery.isError.value" class="banner error">
        Ошибка: {{ catalogQuery.error.value?.message }}
      </div>

      <div v-else class="banner" v-if="catalogMeta">
        <div class="row" style="justify-content:space-between">
          <div>
            <b>Всего:</b> {{ catalogTotal }}
            <span class="muted" v-if="catalogMeta.cache">
              • cache {{ catalogMeta.cache.key }}
              • <span v-if="catalogMeta.cache.refreshing">обновляется</span>
              <span v-else-if="catalogMeta.cache.stale">устарел</span>
              <span v-else class="ok">свежий</span>
            </span>
          </div>
          <div class="muted" v-if="catalogMeta.cache?.lastError">
            lastError: {{ catalogMeta.cache.lastError }}
          </div>
        </div>
      </div>

      <div v-if="catalogQuery.isLoading.value" class="muted">Загрузка…</div>
      <div v-else-if="!items.length" class="muted">Ничего не найдено.</div>

      <div class="catalog" v-else>
        <article v-for="m in items" :key="m.id" class="media">
          <RouterLink :to="{ name: 'title', params: { id: m.id }, query: route.query }">
            <img :src="m.coverLarge || placeholder" :alt="m.title" loading="lazy" />
          </RouterLink>
          <div class="info">
            <RouterLink :to="{ name: 'title', params: { id: m.id }, query: route.query }" class="title">
              {{ m.title }}
            </RouterLink>
            <div class="meta">
              <span>{{ m.averageScore ?? 'n/a' }}</span>
              <span>{{ m.format }} • {{ m.status }}</span>
            </div>
            <div class="muted" style="font-size:12px; line-height:1.2">
              {{ formatGenres(m.genres_json) }}
            </div>

            <div class="row" style="justify-content:space-between">
              <span class="pill" v-if="m.myStatus">{{ m.myStatus }}</span>
              <span class="pill" v-else>—</span>
              <a class="pill" :href="m.siteUrl" target="_blank" rel="noreferrer">AniList ↗</a>
            </div>

            <div class="actions" v-if="me">
              <button
                class="iconbtn"
                :class="{ on: !!m.watchLater }"
                title="Посмотреть позже"
                @click="toggleFlag(m, 'watchLater')"
              >
                WL
              </button>
              <button
                class="iconbtn"
                :class="{ on: !!m.hidden }"
                title="Скрыть"
                @click="toggleFlag(m, 'hidden')"
              >
                Hide
              </button>
              <button
                class="iconbtn"
                :class="{ on: !!m.favorite }"
                title="Избранное"
                @click="toggleFlag(m, 'favorite')"
              >
                ★
              </button>
            </div>
          </div>
        </article>
      </div>

      <div class="pager" v-if="catalogTotal > 0">
        <div class="row">
          <button class="btn" type="button" @click="prev" :disabled="state.offset <= 0">←</button>
          <button class="btn" type="button" @click="next" :disabled="state.offset + state.limit >= catalogTotal">→</button>
        </div>
        <div class="row">
          <span class="muted">Стр.</span>
          <input
            type="number"
            :value="page"
            min="1"
            :max="totalPages"
            @change="jump"
          />
          <span class="muted">/ {{ totalPages }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { fetchCatalog, fetchMeta, suggestTags } from '../api/catalog.js';
import {
  updateFlags,
  refreshMyList,
  fetchFilterPresets,
  saveFilterPreset,
  renameFilterPreset,
  deleteFilterPreset
} from '../api/user.js';
import { getMe } from '../api/auth.js';
import {
  FILTER_PRESET_VERSION,
  makeDefaultFilters,
  parseQueryToFilters,
  normalizeFilters,
  filtersToQuery,
  buildPresetPatch,
  applyPresetPatch,
  migrateToPresetRecord
} from '../filters/model.js';

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();

const placeholder =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="100%" height="100%" fill="#222"/></svg>`
  );

const metaQuery = useQuery({
  queryKey: ['meta'],
  queryFn: fetchMeta,
  staleTime: 60 * 60 * 1000
});

const meta = computed(() => {
  const d = metaQuery.data.value?.data;
  return {
    seasons: d?.seasons || ['WINTER', 'SPRING', 'SUMMER', 'FALL', 'ALL'],
    formats: d?.formats || [],
    statuses: d?.statuses || [],
    userStatuses: d?.userStatuses || [],
    genres: d?.genres || []
  };
});

const meQuery = useQuery({ queryKey: ['auth', 'me'], queryFn: getMe, retry: false, staleTime: 30_000 });
const me = computed(() => meQuery.data.value?.data ?? null);

const syncNote = ref('');
const syncMut = useMutation({
  mutationFn: refreshMyList,
  onSuccess: async () => {
    syncNote.value = 'Синхронизировано';
    await queryClient.invalidateQueries({ queryKey: ['me', 'list'] });
    window.setTimeout(() => {
      if (syncNote.value === 'Синхронизировано') syncNote.value = '';
    }, 2500);
  },
  onError: (e) => {
    syncNote.value = `Ошибка синхронизации: ${e?.message || 'unknown'}`;
    window.setTimeout(() => {
      if (syncNote.value.startsWith('Ошибка синхронизации')) syncNote.value = '';
    }, 5000);
  }
});

function onSync() {
  if (!me.value) {
    syncNote.value = 'Нужно войти через AniList';
    window.setTimeout(() => {
      if (syncNote.value === 'Нужно войти через AniList') syncNote.value = '';
    }, 2500);
    return;
  }
  syncMut.mutate();
}

const builtinPresets = [
  // Built-ins are *delta* presets: they apply on top of current filters.
  { id: 'new_only', name: 'Только новые (без приквела)', delta: { onlyNew: true, onlySequels: false } },
  { id: 'sequels_only', name: 'Только продолжения (есть приквел)', delta: { onlySequels: true, onlyNew: false } },
  { id: 'no_adult', name: 'Без Adult', delta: { adult: false } },
  { id: 'wl', name: 'Только «посмотреть позже» (после входа)', delta: { watchLaterOnly: true } },
  { id: 'show_hidden', name: 'Показывать скрытые (после входа)', delta: { showHidden: true } }
];

const selectedPreset = ref('');

function onPreset(e) {
  const id = String(e.target.value || '');
  selectedPreset.value = id;
  const p = builtinPresets.find((x) => x.id === id);
  if (!p) return;
  // apply delta patch + reset offset
  applyDelta(p.delta);
}

const presetName = ref('');
const LS_KEY = 'animeCatalog.savedFilters.v1';

function loadLocalPresets() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    const migrated = arr
      .map((r) => migrateToPresetRecord(r))
      .filter(Boolean)
      .map((r) => ({ v: FILTER_PRESET_VERSION, name: r.name, patch: r.patch }));
    return migrated;
  } catch {
    return [];
  }
}

function saveLocalPresets(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 50)));
}

const localPresets = ref(loadLocalPresets());

function hashStringDjb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  // Convert to unsigned 32-bit hex
  return (h >>> 0).toString(16).padStart(8, '0');
}

function localPatchId(patch) {
  const sig = JSON.stringify(patch || {});
  return `local:${hashStringDjb2(sig)}`;
}

const serverPresetsQuery = useQuery({
  queryKey: computed(() => ['me', 'filterPresets', !!me.value]),
  queryFn: () => fetchFilterPresets(),
  enabled: computed(() => !!me.value),
  staleTime: 30_000
});

const savedPresets = computed(() => {
  const raw = me.value ? (serverPresetsQuery.data.value?.data || []) : localPresets.value;
  return (raw || [])
    .map((r) => {
      const rec = migrateToPresetRecord(r);
      if (!rec) return null;
      return {
        id: me.value ? r?.id : localPatchId(rec.patch),
        updatedAt: r?.updatedAt,
        v: FILTER_PRESET_VERSION,
        name: rec.name,
        patch: rec.patch
      };
    })
    .filter(Boolean);
});

const savePresetMut = useMutation({
  mutationFn: ({ name, preset }) => saveFilterPreset(name, preset),
  onSuccess: async () => {
    presetName.value = '';
    await queryClient.invalidateQueries({ queryKey: ['me', 'filterPresets'] });
  }
});

const deletePresetMut = useMutation({
  mutationFn: (id) => deleteFilterPreset(id),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['me', 'filterPresets'] });
  }
});

const renamePresetMut = useMutation({
  mutationFn: ({ id, name }) => renameFilterPreset(id, name),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['me', 'filterPresets'] });
  }
});

function savePreset() {
  const name = presetName.value.trim();
  if (!name) return;
  const now = new Date();
  const current = parseQueryToFilters(route.query, { now });
  const patch = buildPresetPatch(current, { now });
  const preset = { v: FILTER_PRESET_VERSION, patch };

  if (me.value) {
    savePresetMut.mutate({ name, preset });
    return;
  }

  const list = localPresets.value || [];
  const sig = JSON.stringify(patch);
  const filtered = list.filter((p) => JSON.stringify(p.patch) != sig && p.name !== name);
  const next = [{ v: FILTER_PRESET_VERSION, name, patch }, ...filtered].slice(0, 50);
  saveLocalPresets(next);
  localPresets.value = next;
  presetName.value = '';
}

function loadPreset(p) {
  const now = new Date();
  const filters = applyPresetPatch(p?.patch, { now });
  router.replace({ query: filtersToQuery(filters, { now }) });
}

const renamingKey = ref('');
const renameDraft = ref('');

function presetKey(p) {
  return String(p?.id || '');
}

function isRenaming(p) {
  const k = presetKey(p);
  return !!k && renamingKey.value === k;
}

function startRename(p) {
  const k = presetKey(p);
  if (!k) return;
  renamingKey.value = k;
  renameDraft.value = String(p?.name || '').trim();
}

function cancelRename() {
  renamingKey.value = '';
  renameDraft.value = '';
}

function confirmRenamePreset(p) {
  const k = presetKey(p);
  const curName = String(p?.name || '').trim();
  const name = String(renameDraft.value || '').trim();
  if (!k) return cancelRename();
  if (!name) return;
  if (name === curName) return cancelRename();

  if (me.value) {
    if (p?.id) renamePresetMut.mutate({ id: p.id, name });
    cancelRename();
    return;
  }

  // local
  const list = (localPresets.value || []).map((x) => {
    if (localPatchId(x.patch) !== k) return x;
    return { ...x, name };
  });
  // Ensure unique names locally (keep first occurrence)
  const out = [];
  const seen = new Set();
  for (const x of list) {
    if (seen.has(x.name)) continue;
    seen.add(x.name);
    out.push(x);
  }
  saveLocalPresets(out);
  localPresets.value = out;
  cancelRename();
}

function confirmDeletePreset(p) {
  const name = String(p?.name || '').trim();
  if (!name) return;
  if (!confirm(`Удалить пресет «${name}»?`)) return;

  if (me.value) {
    if (p?.id) deletePresetMut.mutate(p.id);
    cancelRename();
    return;
  }

  const k = presetKey(p);
  const list = (localPresets.value || []).filter((x) => localPatchId(x.patch) !== k);
  saveLocalPresets(list);
  localPresets.value = list;
  cancelRename();
}
const state = reactive(makeDefaultFilters());

function syncRouteToState() {
  const now = new Date();
  const f = parseQueryToFilters(route.query, { now });
  Object.assign(state, f);
}

watch(
  () => route.query,
  () => syncRouteToState(),
  { immediate: true }
);

function commitFilters(next, { resetOffset = true } = {}) {
  const now = new Date();
  const cur = parseQueryToFilters(route.query, { now });
  const merged = normalizeFilters({ ...cur, ...(next || {}) }, { now });
  if (resetOffset) merged.offset = 0;
  router.replace({ query: filtersToQuery(merged, { now }) });
}

function applyDelta(delta) {
  commitFilters(delta, { resetOffset: true });
}

function toggleMulti(field, value) {
  const current = new Set(state[field]);
  if (current.has(value)) current.delete(value);
  else current.add(value);
  const out = [...current];
  // If user removes everything, normalizeFilters will re-apply defaults.
  commitFilters({ [field]: out });
}

function onToggle(field) {
  commitFilters({ [field]: !state[field] });
}

function onYear(e) {
  const v = Math.max(1900, Math.min(3000, Number(e.target.value || new Date().getFullYear())));
  commitFilters({ year: v });
}

let qTimer = null;
function onQuery(e) {
  const v = String(e.target.value || '').trimStart();
  state.q = v;
  // small debounce to avoid spamming URL while typing
  clearTimeout(qTimer);
  qTimer = setTimeout(() => {
    commitFilters({ q: v || '' });
  }, 250);
}

function onSeason(e) {
  commitFilters({ season: String(e.target.value || 'ALL').toUpperCase() });
}

function onSort(e) {
  commitFilters({ sort: String(e.target.value || 'score_desc') });
}

function onMinScore(e) {
  const raw = e?.target?.value;
  const v = Math.max(0, Math.min(100, Number(raw == null ? 0 : raw)));
  commitFilters({ minScore: Math.trunc(v) });
}

function onIncludeGenres(e) {
  const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
  commitFilters({ includeGenres: opts });
}

function onExcludeGenres(e) {
  const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
  commitFilters({ excludeGenres: opts });
}

function onLimit(e) {
  const v = Math.min(80, Math.max(1, Number(e.target.value || 40)));
  commitFilters({ limit: v });
}

const includeTagInput = ref('');
const includeTagFocused = ref(false);

const includeTagSuggest = useQuery({
  queryKey: computed(() => ['suggestTags', 'inc', includeTagInput.value.trim()]),
  queryFn: () => suggestTags(includeTagInput.value.trim()),
  enabled: computed(() => includeTagInput.value.trim().length >= 1),
  staleTime: 30_000
});

function addIncludeTag(tag) {
  const t = String(tag || '').trim();
  if (!t) return;
  if (state.includeTags.includes(t)) {
    includeTagInput.value = '';
    return;
  }
  commitFilters({ includeTags: [...state.includeTags, t] });
  includeTagInput.value = '';
}

function removeIncludeTag(tag) {
  commitFilters({ includeTags: state.includeTags.filter((x) => x !== tag) });
}

function onIncludeTagBlur() {
  setTimeout(() => {
    includeTagFocused.value = false;
  }, 120);
}

const tagInput = ref('');
const tagFocused = ref(false);

const tagSuggest = useQuery({
  queryKey: computed(() => ['suggestTags', tagInput.value.trim()]),
  queryFn: () => suggestTags(tagInput.value.trim()),
  enabled: computed(() => tagInput.value.trim().length >= 1),
  staleTime: 30_000
});

function addExcludeTag(tag) {
  const t = String(tag || '').trim();
  if (!t) return;
  if (state.excludeTags.includes(t)) {
    tagInput.value = '';
    return;
  }
  commitFilters({ excludeTags: [...state.excludeTags, t] });
  tagInput.value = '';
}

function removeExcludeTag(tag) {
  commitFilters({ excludeTags: state.excludeTags.filter((x) => x !== tag) });
}

function onTagBlur() {
  // allow click on suggestion buttons
  setTimeout(() => {
    tagFocused.value = false;
  }, 120);
}

function reset() {
  const now = new Date();
  const d = makeDefaultFilters({ now });
  router.replace({ query: filtersToQuery(d, { now }) });
}

const params = computed(() => ({
  q: state.q,
  year: state.year,
  season: state.season,
  status: state.status,
  format: state.format,
  minScore: state.minScore,
  adult: state.adult,
  includeTags: state.includeTags,
  includeGenres: state.includeGenres,
  excludeTags: state.excludeTags,
  excludeGenres: state.excludeGenres,
  onlyNew: state.onlyNew,
  onlySequels: state.onlySequels,
  sort: state.sort,
  offset: state.offset,
  limit: state.limit,
  myStatus: state.myStatus,
  notInMyList: state.notInMyList,
  watchLaterOnly: state.watchLaterOnly,
  showHidden: state.showHidden
}));

const catalogQuery = useQuery({
  queryKey: computed(() => ['catalog', JSON.stringify(params.value), !!me.value]),
  queryFn: () => fetchCatalog(params.value),
  keepPreviousData: true,
  staleTime: 15_000
});

const items = computed(() => catalogQuery.data.value?.data || []);
const catalogMeta = computed(() => catalogQuery.data.value?.meta || null);
const catalogTotal = computed(() => catalogMeta.value?.paging?.total || 0);

const page = computed(() => Math.floor(state.offset / state.limit) + 1);
const totalPages = computed(() => Math.max(1, Math.ceil(catalogTotal.value / state.limit)));

function prev() {
  commitFilters({ offset: Math.max(0, state.offset - state.limit) }, { resetOffset: false });
}

function next() {
  commitFilters({ offset: state.offset + state.limit }, { resetOffset: false });
}

function jump(e) {
  const p = Math.max(1, Math.min(totalPages.value, Number(e.target.value || 1)));
  commitFilters({ offset: (p - 1) * state.limit }, { resetOffset: false });
}

function formatGenres(genresJson) {
  if (!genresJson) return '';
  try {
    const arr = JSON.parse(genresJson);
    return Array.isArray(arr) ? arr.slice(0, 4).join(', ') : '';
  } catch {
    return '';
  }
}

const flagMut = useMutation({
  mutationFn: ({ mediaId, patch }) => updateFlags(mediaId, patch),
  onMutate: async ({ mediaId, patch }) => {
    await queryClient.cancelQueries({ queryKey: ['catalog'] });
    const snapshots = [];
    const queries = queryClient
      .getQueryCache()
      .findAll({ queryKey: ['catalog'] })
      .map((q) => q.queryKey);

    for (const qk of queries) {
      const prev = queryClient.getQueryData(qk);
      snapshots.push([qk, prev]);
      if (!prev?.data) continue;
      const nextData = prev.data.map((m) => {
        if (m.id !== mediaId) return m;
        return { ...m, ...patch };
      });
      queryClient.setQueryData(qk, { ...prev, data: nextData });
    }
    return { snapshots };
  },
  onError: (_err, _vars, ctx) => {
    for (const [qk, prev] of ctx?.snapshots || []) queryClient.setQueryData(qk, prev);
  },
  onSettled: async () => {
    await queryClient.invalidateQueries({ queryKey: ['catalog'] });
  }
});

function toggleFlag(media, field) {
  const mediaId = media.id;
  const next = !media[field];
  flagMut.mutate({ mediaId, patch: { [field]: next ? 1 : 0 } });
}
</script>


<style scoped>
.presetList {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.presetItem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: color-mix(in oklab, var(--panel) 90%, transparent);
}

.presetName {
  flex: 1;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--text);
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.presetName:hover {
  color: color-mix(in oklab, var(--text) 75%, var(--accent));
}

.presetInput {
  flex: 1;
}

.presetActions {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.miniBtn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  border-radius: 10px;
  padding: 6px 8px;
  min-width: 32px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}

.miniBtn:hover {
  border-color: color-mix(in oklab, var(--border) 40%, var(--accent));
}

.miniBtn.danger {
  border-color: color-mix(in oklab, var(--danger) 30%, var(--border));
  background: color-mix(in oklab, var(--danger) 12%, transparent);
}
</style>
