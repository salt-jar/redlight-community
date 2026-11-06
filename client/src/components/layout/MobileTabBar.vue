<script setup lang="ts">
import { computed } from 'vue';
import { BookOutlined, HomeOutlined, MessageOutlined, UserOutlined } from '@ant-design/icons-vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const mine = computed(() => (auth.user ? `/profile/${auth.user.id}` : '/profile/0'));
</script>

<template>
  <nav class="mobile-tab">
    <router-link to="/" exact-active-class="active">
      <HomeOutlined />
      <span>首页</span>
    </router-link>
    <router-link to="/books" active-class="active">
      <BookOutlined />
      <span>图书</span>
    </router-link>
    <router-link to="/chat" active-class="active">
      <MessageOutlined />
      <span>群聊</span>
    </router-link>
    <router-link :to="mine" active-class="active">
      <UserOutlined />
      <span>我的</span>
    </router-link>
  </nav>
</template>

<style scoped>
.mobile-tab a {
  text-decoration: none;
}

.mobile-tab :deep(svg) {
  font-size: 20px;
}

.mobile-tab .active {
  color: var(--rl-primary);
}
</style>
