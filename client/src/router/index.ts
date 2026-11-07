import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    title?: string;
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
      meta: { title: '登录' },
    },
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/Home.vue'),
      meta: { requiresAuth: true, title: '首页' },
    },
    {
      path: '/books',
      name: 'books',
      component: () => import('@/views/Books.vue'),
      meta: { requiresAuth: true, title: '赤光文献馆' },
    },
    {
      path: '/books/:id',
      name: 'book-detail',
      component: () => import('@/views/BookDetail.vue'),
      meta: { requiresAuth: true, title: '图书详情' },
    },
    {
      path: '/books/:id/preview',
      name: 'book-reader',
      component: () => import('@/views/Reader.vue'),
      meta: { requiresAuth: true, title: '在线阅读' },
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/views/Search.vue'),
      meta: { requiresAuth: true, title: '搜索' },
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('@/views/Chat.vue'),
      meta: { requiresAuth: true, title: '群聊' },
    },
    {
      path: '/profile/:id',
      name: 'profile',
      component: () => import('@/views/Profile.vue'),
      meta: { requiresAuth: true, title: '个人主页' },
    },
    {
      path: '/upload',
      name: 'upload',
      component: () => import('@/views/Upload.vue'),
      meta: { requiresAuth: true, title: '上传图书' },
    },
    {
      path: '/store/:storeId(\\d+)',
      name: 'store-admin',
      component: () => import('@/views/AdminPortal.vue'),
      meta: { title: '门店管理后台' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFound.vue'),
      meta: { title: '页面不存在' },
    },
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash, top: 80, behavior: 'smooth' };
    return { top: 0 };
  },
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  document.title = to.meta.title ? `${to.meta.title} · 赤光社` : '赤光社 · 马列主义爱好者社区';
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && auth.isLoggedIn) {
    return { path: '/' };
  }
  return true;
});

export default router;
