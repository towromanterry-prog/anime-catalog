import { createRouter, createWebHistory } from 'vue-router';
import CatalogView from './views/CatalogView.vue';
import TitleView from './views/TitleView.vue';
import AdminView from './views/AdminView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'catalog', component: CatalogView },
    { path: '/title/:id', name: 'title', component: TitleView, props: true },
    { path: '/admin', name: 'admin', component: AdminView }
  ],
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.name === from.name) return;
    return { top: 0 };
  }
});
