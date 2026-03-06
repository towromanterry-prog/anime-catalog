<!-- web/src/App.vue -->
<template>
  <header class="topbar">
    <div class="brand">
      <h1>Anime Catalog</h1>
      <span class="pill" v-if="me">{{ me.name }}</span>
      <span class="pill" v-else>guest</span>
    </div>

    <nav class="nav">
      <RouterLink to="/">Каталог</RouterLink>
      <RouterLink to="/admin" v-if="me?.isAdmin">Админ</RouterLink>
      <button class="btn primary" v-if="!me" @click="onLogin" :disabled="meQuery.isFetching.value">
        Войти через AniList
      </button>
      <RouterLink to="/settings" v-if="me">Настройки</RouterLink>
      <button class="btn danger" v-if="me" @click="onLogout" :disabled="logoutMut.isPending.value">
        Выйти
      </button>
    </nav>
  </header>

  <main class="container">
    <div v-if="meQuery.isError.value" class="banner error">
      Не удалось проверить сессию. <span class="muted">{{ meQuery.error.value?.message }}</span>
    </div>
    <RouterView />
  </main>
</template>

<script setup>
import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { getMe, logout, startAniListLogin } from './api/auth.js';

const queryClient = useQueryClient();

const meQuery = useQuery({
  queryKey: ['auth', 'me'],
  queryFn: getMe,
  retry: false,
  staleTime: 30_000
});

const me = computed(() => meQuery.data.value?.data ?? null);

const logoutMut = useMutation({
  mutationFn: logout,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    await queryClient.invalidateQueries({ queryKey: ['catalog'] });
  }
});

function onLogin() {
  startAniListLogin();
}

function onLogout() {
  logoutMut.mutate();
}
</script>
