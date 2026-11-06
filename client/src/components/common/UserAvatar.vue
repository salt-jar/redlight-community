<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    user?: { nickname?: string; avatarUrl?: string } | null;
    size?: number;
  }>(),
  { user: null, size: 40 },
);

const COLORS = ['#C8102E', '#8B0000', '#A3542F', '#B07A2A', '#7A4E3B', '#9C3D54', '#4F6457'];

const nickname = computed(() => props.user?.nickname || '同志');
const initial = computed(() => Array.from(nickname.value)[0] || '同');
const background = computed(() => {
  let hash = 0;
  for (const char of nickname.value) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return COLORS[hash % COLORS.length];
});
const fontSize = computed(() => Math.max(12, Math.round(props.size * 0.42)));
</script>

<template>
  <span
    class="user-avatar"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${fontSize}px` }"
    :title="nickname"
  >
    <img v-if="user?.avatarUrl" :src="user.avatarUrl" :alt="nickname" />
    <span v-else class="avatar-fallback" :style="{ background }">{{ initial }}</span>
  </span>
</template>

<style scoped>
.user-avatar {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  background: #fff1f0;
  color: #fff;
  font-weight: 600;
  user-select: none;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  letter-spacing: 0;
}
</style>
