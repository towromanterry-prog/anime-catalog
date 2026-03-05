<template>
  <div class="card">
    <div class="hd">Admin</div>
    <div class="bd">
      <div class="banner">
        Админ-роуты защищены заголовком <b>X-Admin-Key</b>. Ключ храните только локально.
      </div>

      <div class="grid" style="grid-template-columns: 1fr 1fr; gap:12px">
        <div class="field">
          <label>Admin key</label>
          <input v-model="adminKey" placeholder="dev-admin-key" />
        </div>

        <div class="field">
          <label>Cache refresh</label>
          <div class="row">
            <input type="number" v-model.number="year" min="1900" max="3000" style="width:120px" />
            <select v-model="season">
              <option v-for="s in seasons" :key="s" :value="s">{{ s }}</option>
            </select>
            <button class="btn primary" type="button" @click="doRefresh" :disabled="refreshMut.isPending.value || !adminKey">
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div v-if="cacheQuery.isError.value" class="banner error">
        Ошибка: {{ cacheQuery.error.value?.message }}
      </div>

      <div v-else-if="!adminKey" class="muted">Введите admin key, чтобы увидеть состояние кэша.</div>
      <div v-else-if="cacheQuery.isLoading.value" class="muted">Загрузка…</div>

      <div v-else class="card" style="margin-top:12px">
        <div class="bd" style="overflow:auto">
          <table style="width:100%; border-collapse:collapse; font-size:13px">
            <thead>
              <tr>
                <th style="text-align:left; padding:8px; border-bottom:1px solid var(--border)">key</th>
                <th style="text-align:left; padding:8px; border-bottom:1px solid var(--border)">updatedAt</th>
                <th style="text-align:left; padding:8px; border-bottom:1px solid var(--border)">ttl</th>
                <th style="text-align:left; padding:8px; border-bottom:1px solid var(--border)">refreshing</th>
                <th style="text-align:left; padding:8px; border-bottom:1px solid var(--border)">lastError</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in cacheRows" :key="row.cache_key">
                <td style="padding:8px; border-bottom:1px solid var(--border)">{{ row.cache_key }}</td>
                <td style="padding:8px; border-bottom:1px solid var(--border)">{{ row.updatedAt || '—' }}</td>
                <td style="padding:8px; border-bottom:1px solid var(--border)">{{ row.ttlSeconds }}</td>
                <td style="padding:8px; border-bottom:1px solid var(--border)">
                  <span v-if="row.refreshing" class="pill">true</span>
                  <span v-else class="pill">false</span>
                </td>
                <td style="padding:8px; border-bottom:1px solid var(--border)">
                  <span class="muted">{{ row.lastError || '—' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { apiFetch } from '../api/http.js';
import { fetchMeta } from '../api/catalog.js';

const queryClient = useQueryClient();

const adminKey = ref('');
const year = ref(new Date().getFullYear());
const season = ref('ALL');

const metaQuery = useQuery({ queryKey: ['meta'], queryFn: fetchMeta, staleTime: 60 * 60 * 1000 });
const seasons = computed(() => metaQuery.data.value?.data?.seasons || ['WINTER', 'SPRING', 'SUMMER', 'FALL', 'ALL']);

const cacheQuery = useQuery({
  queryKey: computed(() => ['admin', 'cache', adminKey.value]),
  queryFn: () =>
    apiFetch('/api/admin/cache', {
      headers: { 'X-Admin-Key': adminKey.value }
    }),
  enabled: computed(() => !!adminKey.value),
  refetchInterval: 10_000
});

const cacheRows = computed(() => cacheQuery.data.value?.data || []);

const refreshMut = useMutation({
  mutationFn: () =>
    apiFetch(`/api/admin/cache/refresh?year=${encodeURIComponent(year.value)}&season=${encodeURIComponent(season.value)}`, {
      method: 'POST',
      headers: { 'X-Admin-Key': adminKey.value }
    }),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'cache'] });
  }
});

function doRefresh() {
  refreshMut.mutate();
}
</script>
