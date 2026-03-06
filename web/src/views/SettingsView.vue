<!-- web/src/views/SettingsView.vue -->
<template>
  <div class="card">
    <div class="hd">Настройки</div>
    <div class="bd">
      <div v-if="meQuery.isError.value" class="banner error">
        Не удалось загрузить профиль. <span class="muted">{{ meQuery.error.value?.message }}</span>
      </div>

      <div v-else class="field">
        <label>Пользователь</label>
        <div>
          <b v-if="me">{{ me.name }}</b>
          <span v-else class="muted">guest</span>
        </div>
      </div>

      <div class="field">
        <label>Внешний вид</label>
        <div class="row">
          <button class="btn" type="button" :class="{ primary: prefs.theme === 'light' }" @click="setTheme('light')">Светлая</button>
          <button class="btn" type="button" :class="{ primary: prefs.theme === 'dark' }" @click="setTheme('dark')">Тёмная</button>
          <button class="btn" type="button" :class="{ primary: prefs.theme === 'system' }" @click="setTheme('system')">Системная</button>
        </div>
        <button class="btn" type="button" :class="{ primary: prefs.vibration }" @click="toggleVibration">
          Виброотклик: <b>{{ prefs.vibration ? 'Вкл' : 'Выкл' }}</b>
        </button>
      </div>

      <div class="field">
        <label>Синхронизация</label>
        <button
          class="btn"
          type="button"
          @click="onSync"
          :disabled="!me || syncMut.isPending.value"
          :title="me ? 'Обновить списки из AniList' : 'Войдите через AniList, чтобы синхронизировать'"
        >
          Синхронизировать списки AniList
        </button>
        <div v-if="syncMut.isPending.value" class="muted" style="font-size:12px; margin-top:6px">Загрузка…</div>
        <div v-else-if="syncNote" class="muted" style="font-size:12px; margin-top:6px">{{ syncNote }}</div>
      </div>

      <div v-if="me" class="field">
        <label>Сохранённые фильтры</label>

        <div v-if="presetsQuery.isError.value" class="muted" style="font-size:12px">
          Ошибка: {{ presetsQuery.error.value?.message }}
        </div>
        <div v-else-if="presetsQuery.isLoading.value" class="muted" style="font-size:12px">Загрузка…</div>
        <div v-else-if="!presets.length" class="muted" style="font-size:12px">Пока нет пресетов.</div>

        <div v-else class="presetList">
          <div v-for="p in presets" :key="p.id" class="presetItem">
            <template v-if="isRenaming(p)">
              <input
                v-model="renameDraft"
                class="presetInput"
                placeholder="Название"
                @keydown.enter.prevent="confirmRenamePreset(p)"
                @keydown.esc.prevent="cancelRename"
              />
              <div class="presetActions">
                <button class="miniBtn" type="button" title="Сохранить" @click="confirmRenamePreset(p)" :disabled="renamePresetMut.isPending.value">✓</button>
                <button class="miniBtn" type="button" title="Отмена" @click="cancelRename" :disabled="renamePresetMut.isPending.value">×</button>
              </div>
            </template>

            <template v-else>
              <button class="presetName" type="button" @click="noop" :title="p.name">
                {{ p.name }}
              </button>
              <div class="presetActions">
                <button class="miniBtn" type="button" title="Переименовать" @click="startRename(p)" :disabled="renamePresetMut.isPending.value || deletePresetMut.isPending.value">✎</button>
                <button class="miniBtn danger" type="button" title="Удалить" @click="confirmDeletePreset(p)" :disabled="deletePresetMut.isPending.value || renamePresetMut.isPending.value">✕</button>
              </div>
            </template>
          </div>
        </div>

        <div v-if="presetNote" class="muted" style="font-size:12px; margin-top:6px">{{ presetNote }}</div>
      </div>

      <div v-else class="muted" style="font-size:12px">
        Войдите через AniList, чтобы управлять серверными пресетами.
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { getMe } from '../api/auth.js';
import { refreshMyList, fetchFilterPresets, renameFilterPreset, deleteFilterPreset } from '../api/user.js';
import { migrateToPresetRecord } from '../filters/model.js';
import { prefs, vibrate } from '../utils/prefs.js';

const queryClient = useQueryClient();

const meQuery = useQuery({
  queryKey: ['auth', 'me'],
  queryFn: getMe,
  retry: false,
  staleTime: 30_000
});

const me = computed(() => meQuery.data.value?.data ?? null);

function setTheme(mode) {
  if (prefs.theme === mode) return;
  prefs.theme = mode;
  vibrate(30);
}

function toggleVibration() {
  if (prefs.vibration) {
    vibrate(30);
    prefs.vibration = false;
    return;
  }
  prefs.vibration = true;
  vibrate(30);
}

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

const presetsQuery = useQuery({
  queryKey: computed(() => ['me', 'filterPresets', !!me.value]),
  queryFn: () => fetchFilterPresets(),
  enabled: computed(() => !!me.value),
  staleTime: 30_000
});

const presets = computed(() => {
  const raw = presetsQuery.data.value?.data || [];
  return (raw || [])
    .map((r) => {
      const rec = migrateToPresetRecord(r);
      if (!rec) return null;
      return { id: r?.id, name: rec.name };
    })
    .filter((x) => x && x.id && x.name);
});

const presetNote = ref('');

const renamePresetMut = useMutation({
  mutationFn: ({ id, name }) => renameFilterPreset(id, name),
  onSuccess: async () => {
    presetNote.value = 'Сохранено';
    await queryClient.invalidateQueries({ queryKey: ['me', 'filterPresets'] });
    window.setTimeout(() => {
      if (presetNote.value === 'Сохранено') presetNote.value = '';
    }, 2000);
  },
  onError: (e) => {
    presetNote.value = `Ошибка: ${e?.message || 'unknown'}`;
    window.setTimeout(() => {
      if (presetNote.value.startsWith('Ошибка')) presetNote.value = '';
    }, 5000);
  }
});

const deletePresetMut = useMutation({
  mutationFn: (id) => deleteFilterPreset(id),
  onSuccess: async () => {
    presetNote.value = 'Удалено';
    await queryClient.invalidateQueries({ queryKey: ['me', 'filterPresets'] });
    window.setTimeout(() => {
      if (presetNote.value === 'Удалено') presetNote.value = '';
    }, 2000);
  },
  onError: (e) => {
    presetNote.value = `Ошибка: ${e?.message || 'unknown'}`;
    window.setTimeout(() => {
      if (presetNote.value.startsWith('Ошибка')) presetNote.value = '';
    }, 5000);
  }
});

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
  renamePresetMut.mutate({ id: k, name });
  cancelRename();
}

function confirmDeletePreset(p) {
  const name = String(p?.name || '').trim();
  const id = presetKey(p);
  if (!id || !name) return;
  if (!confirm(`Удалить пресет «${name}»?`)) return;
  deletePresetMut.mutate(id);
  cancelRename();
}

function noop() {}
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
