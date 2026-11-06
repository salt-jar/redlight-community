<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="not-found">
    <div class="star">★</div>
    <h1>404</h1>
    <p>这条道路尚未开辟，同志。</p>
    <a-button type="primary" @click="router.push('/')">回到首页</a-button>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--rl-bg);
  color: var(--rl-text-secondary);
}

.star {
  color: var(--rl-gold);
  font-size: 40px;
}

h1 {
  margin: 0;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 64px;
  letter-spacing: 6px;
}

p {
  margin-bottom: 14px;
  font-family: var(--rl-serif);
  letter-spacing: 2px;
}
</style>
