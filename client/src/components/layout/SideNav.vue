<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { BookOutlined, HomeOutlined, MessageOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const auth = useAuthStore();

const myProfile = computed(() => (auth.user ? `/profile/${auth.user.id}` : '/profile/0'));

const items = computed(() => [
  { key: 'home', label: '首页', icon: HomeOutlined, to: '/', active: route.path === '/' },
  { key: 'books', label: '图书', icon: BookOutlined, to: '/books', active: route.path.startsWith('/books') },
  { key: 'chat', label: '群聊', icon: MessageOutlined, to: '/chat', active: route.path === '/chat' },
  {
    key: 'mine',
    label: '我的',
    icon: UserOutlined,
    to: myProfile.value,
    active: route.path.startsWith('/profile') && route.params.id === String(auth.user?.id),
  },
]);

function goSettings() {
  message.info('设置功能即将上线');
}
</script>

<template>
  <aside class="side-nav">
    <nav class="nav-list">
      <router-link
        v-for="item in items"
        :key="item.key"
        :to="item.to"
        class="nav-item"
        :class="{ active: item.active }"
      >
        <component :is="item.icon" class="nav-icon" />
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
      <div class="nav-divider"></div>
      <button class="nav-item nav-button" type="button" @click="goSettings">
        <SettingOutlined class="nav-icon" />
        <span class="nav-label">设置</span>
      </button>
    </nav>
  </aside>
</template>

<style scoped>
.side-nav {
  align-self: start;
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 44px;
  padding: 0 16px;
  border: none;
  border-left: 3px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #595959;
  font-family: var(--rl-sans);
  font-size: 15px;
  text-align: left;
  cursor: pointer;
  transition: all 0.18s ease;
}

.nav-item:hover {
  background: #fff1f0;
  color: var(--rl-primary);
}

.nav-item.active {
  border-left-color: var(--rl-gold);
  background: #fff1f0;
  color: var(--rl-primary);
  font-weight: 600;
}

.nav-icon {
  font-size: 20px;
  color: inherit;
}

.nav-label {
  white-space: nowrap;
}

.nav-divider {
  height: 1px;
  margin: 8px 12px;
  background: var(--rl-border);
}

.nav-button {
  font-weight: 400;
}

@media (max-width: 1199px) {
  .nav-item {
    justify-content: center;
    padding: 0;
    border-left-width: 3px;
  }

  .nav-label {
    display: none;
  }

  .nav-divider {
    margin: 8px 4px;
  }
}
</style>
