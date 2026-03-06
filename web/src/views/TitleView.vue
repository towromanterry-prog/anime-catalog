<template>
  <div class="row" style="margin-bottom:12px; justify-content:space-between">
    <button class="btn" type="button" @click="goBack">← Назад</button>
    <div class="row" v-if="title">
      <a class="btn" :href="title.siteUrl" target="_blank" rel="noreferrer">Открыть на AniList ↗</a>
    </div>
  </div>

  <div v-if="titleQuery.isError.value" class="banner error">
    Ошибка: {{ titleQuery.error.value?.message }}
  </div>
  <div v-else-if="titleQuery.isLoading.value" class="muted">Загрузка…</div>

  <div v-else-if="title" class="card">
    <div class="bd">
      <div class="row" style="gap:16px; align-items:flex-start">
        <img
          :src="title.coverLarge || placeholder"
          :alt="title.title"
          style="width:220px; height:320px; object-fit:cover; border-radius:16px; border:1px solid var(--border)"
        />

        <div style="flex:1; min-width:240px">
          <h2 style="margin:0 0 10px 0">{{ title.title }}</h2>
          <div class="row muted" style="font-size:13px">
            <span>Score: {{ title.averageScore ?? 'n/a' }}</span>
            <span>•</span>
            <span>{{ title.format }} • {{ title.status }}</span>
            <span>•</span>
            <span>{{ title.seasonYear || title.year }} {{ title.season }}</span>
            <span v-if="title.isAdult" class="pill" style="border-color:color-mix(in oklab, var(--danger) 40%, var(--border))">18+</span>
          </div>

          <div style="margin-top:10px" class="row" v-if="genres.length">
            <span class="pill" v-for="g in genres" :key="g">{{ g }}</span>
          </div>

          <div style="margin-top:12px" v-if="me">
            <div class="row" style="gap:8px">
              <button class="iconbtn" :class="{ on: flags.watchLater }" @click="toggle('watchLater')">WL</button>
              <button class="iconbtn" :class="{ on: flags.hidden }" @click="toggle('hidden')">Hide</button>
              <button class="iconbtn" :class="{ on: flags.favorite }" @click="toggle('favorite')">★</button>
              <span class="pill" v-if="myStatus">мой статус: {{ myStatus }}</span>
              <span class="pill" v-else-if="listError" title="Ошибка синхронизации AniList">sync error</span>
              <span class="pill" v-if="myProgress != null">progress: {{ myProgress }}</span>
              <span class="pill" v-if="myScore != null">score: {{ myScore }}</span>
            </div>

            <div class="field" style="margin-top:12px">
              <label>Заметка</label>
              <textarea
                rows="4"
                :value="noteDraft"
                @input="noteDraft = $event.target.value"
                placeholder="Например: что посмотреть первым…"
              />
              <div class="row" style="justify-content:space-between">
                <span class="muted" style="font-size:12px">{{ noteDraft.length }}/500</span>
                <button class="btn" type="button" @click="saveNote" :disabled="noteMut.isPending.value">
                  Сохранить
                </button>
              </div>
            </div>
          </div>

          <div v-else class="banner" style="margin-top:12px">
            Войдите через AniList, чтобы использовать «посмотреть позже», «скрыть», «избранное» и заметки.
          </div>
        </div>
      </div>

      <hr style="border:0; border-top:1px solid var(--border); margin:16px 0" />

      <h3 style="margin:0 0 10px 0">Описание</h3>
      <div v-if="safeDescription" v-html="safeDescription" style="line-height:1.5"></div>
      <div v-else class="muted">Описание отсутствует.</div>

      <div v-if="tags.length" style="margin-top:16px">
        <h3 style="margin:0 0 10px 0">Теги</h3>
        <div class="row" style="gap:8px">
          <span class="pill" v-for="t in tags" :key="t.name">{{ t.name }}<span class="muted"> ({{ t.rank }})</span></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import DOMPurify from 'dompurify';
import { fetchTitle } from '../api/catalog.js';
import { getMe } from '../api/auth.js';
import { fetchFlags, fetchMyList, updateFlags } from '../api/user.js';

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();

const placeholder =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="100%" height="100%" fill="#222"/></svg>`
  );

const id = computed(() => Number(route.params.id));

const meQuery = useQuery({ queryKey: ['auth', 'me'], queryFn: getMe, retry: false, staleTime: 30_000 });
const me = computed(() => meQuery.data.value?.data ?? null);

const titleQuery = useQuery({
  queryKey: computed(() => ['title', id.value]),
  queryFn: () => fetchTitle(id.value),
  enabled: computed(() => Number.isFinite(id.value))
});

const title = computed(() => titleQuery.data.value?.data ?? null);
const genres = computed(() => title.value?.genres || safeGenresFromJson(title.value?.genres_json));
const tags = computed(() => title.value?.tags || []);
const safeDescription = computed(() => {
  const html = title.value?.description || '';
  if (!html) return '';
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
});

const flagsQuery = useQuery({
  queryKey: ['me', 'flags'],
  queryFn: fetchFlags,
  enabled: computed(() => !!me.value),
  staleTime: 10_000
});

const listQuery = useQuery({
  queryKey: ['me', 'list'],
  queryFn: fetchMyList,
  enabled: computed(() => !!me.value),
  staleTime: 30_000
});

const flags = computed(() => {
  const rows = flagsQuery.data.value?.data || [];
  const row = rows.find((r) => r.media_id === id.value);
  return {
    watchLater: !!row?.watchLater,
    hidden: !!row?.hidden,
    favorite: !!row?.favorite,
    note: row?.note || ''
  };
});

const myEntry = computed(() => {
  const rows = listQuery.data.value?.data || [];
  return rows.find((r) => r.media_id === id.value) || null;
});

const listError = computed(() => listQuery.data.value?.meta?.cache?.lastError || null);

const myStatus = computed(() => myEntry.value?.status || null);
const myProgress = computed(() => (myEntry.value?.progress ?? null));
const myScore = computed(() => (myEntry.value?.score ?? null));

const flagMut = useMutation({
  mutationFn: ({ mediaId, patch }) => updateFlags(mediaId, patch),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['me', 'flags'] });
    await queryClient.invalidateQueries({ queryKey: ['catalog'] });
  }
});

function toggle(field) {
  const next = !flags.value[field];
  flagMut.mutate({ mediaId: id.value, patch: { [field]: next ? 1 : 0 } });
}

const noteDraft = ref('');

watch(
  () => flags.value.note,
  (v) => {
    // keep draft in sync only if user hasn't typed
    if (!noteDraft.value || noteDraft.value === v) noteDraft.value = v || '';
  },
  { immediate: true }
);

const noteMut = useMutation({
  mutationFn: (note) => updateFlags(id.value, { note }),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['me', 'flags'] });
  }
});

function saveNote() {
  noteMut.mutate(noteDraft.value || null);
}

function goBack() {
  router.push({ name: 'catalog', query: route.query });
}

function safeGenresFromJson(genresJson) {
  if (!genresJson) return [];
  try {
    const arr = JSON.parse(genresJson);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
</script>
