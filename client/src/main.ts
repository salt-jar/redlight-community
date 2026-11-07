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

// 已有 token 时后台刷新用户资料，失败由 401/403 拦截器统一处理
function revalidateUser() {
  if (!auth.isLoggedIn) return;
  auth.fetchMe().catch(() => {
    /* 网络暂不可用时保留本地登录态 */
  });
}

if (auth.isLoggedIn) revalidateUser();

// 被管理员封锁后，活跃页面最多 30 秒内自动退出；切回页面时立即复查
window.setInterval(revalidateUser, 30000);
window.addEventListener('focus', revalidateUser);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') revalidateUser();
});

app.mount('#app');
