import { createApp } from 'vue';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import App from './App.vue';
import { router } from './router.js';
import './style.css';

const queryClient = new QueryClient();
const app = createApp(App);
app.use(VueQueryPlugin, { queryClient });
app.use(router);
app.mount('#app');
