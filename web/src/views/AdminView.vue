<script setup>
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { apiFetch } from '../api/http.js';
import { fetchMeta } from '../api/catalog.js';

const queryClient = useQueryClient();

const adminKey = ref(localStorage.getItem('adminKey') || '');
watch(adminKey, (newVal) => {
  localStorage.setItem('adminKey', newVal);
});

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
