import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Antd from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import '@/styles/theme.css';
import App from './App.vue';
import router from './router';
import { setUnauthorizedHandler } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(Antd);

const auth = useAuthStore(pinia);
setUnauthorizedHandler(() => {
  auth.logout();
  const current = router.currentRoute.value;
  if (current.path !== '/login') {
    router.replace({ path: '/login', query: { redirect: current.fullPath } });
  }
});

// 已有 token 时后台刷新用户资料，失败由 401 拦截器统一处理
if (auth.isLoggedIn) {
  auth.fetchMe().catch(() => {
    /* 网络暂不可用时保留本地登录态 */
  });
}

app.mount('#app');
