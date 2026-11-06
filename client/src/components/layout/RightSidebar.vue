<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { io, type Socket } from 'socket.io-client';
import { BarChartOutlined, FireOutlined, TeamOutlined } from '@ant-design/icons-vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { apiCommunityStats, apiHotTopics, apiOnlineSnapshot } from '@/api/stats';
import { useAuthStore } from '@/stores/auth';
import type { CommunityStats, HotTopic, OnlineSnapshot, PostAuthor } from '@/types';
import { formatCount, formatStat } from '@/utils/format';

const router = useRouter();
const auth = useAuthStore();

const hotTopics = ref<HotTopic[]>([]);
const community = ref<CommunityStats | null>(null);
const onlineUsers = ref<PostAuthor[]>([]);
const topicsLoading = ref(true);
let socket: Socket | null = null;

const onlineCount = computed(() => onlineUsers.value.length);
const visibleOnline = computed(() => onlineUsers.value.slice(0, 5));

function applyOnline(snapshot: OnlineSnapshot) {
  onlineUsers.value = Array.isArray(snapshot?.users) ? snapshot.users : [];
}

async function load() {
  const [topicsResult, communityResult, onlineResult] = await Promise.allSettled([
    apiHotTopics(),
    apiCommunityStats(),
    apiOnlineSnapshot(),
  ]);
  if (topicsResult.status === 'fulfilled') hotTopics.value = topicsResult.value;
  topicsLoading.value = false;
  if (communityResult.status === 'fulfilled') community.value = communityResult.value;
  if (onlineResult.status === 'fulfilled') applyOnline(onlineResult.value);
}

function connectPresence() {
  if (!auth.token) return;
  socket = io({
    auth: { token: auth.token },
    transports: ['websocket', 'polling'],
  });
  socket.on('chat:online', applyOnline);
}

function goTopic(topic: string) {
  void router.push({ path: '/search', query: { q: `#${topic}#` } });
}

function goProfile(user: PostAuthor) {
  void router.push(`/profile/${user.id}`);
}

onMounted(() => {
  void load();
  connectPresence();
});

onBeforeUnmount(() => {
  socket?.disconnect();
  socket = null;
});
</script>

<template>
  <aside class="right-sidebar">
    <section class="side-card">
      <h3 class="side-title">
        <FireOutlined class="title-icon fire" />
        今日热榜
      </h3>
      <div v-if="topicsLoading" class="side-placeholder">加载中...</div>
      <ol v-else-if="hotTopics.length" class="topic-list">
        <li v-for="(item, index) in hotTopics" :key="item.topic">
          <button class="topic-row" type="button" @click="goTopic(item.topic)">
            <span class="topic-rank" :class="{ top: index < 3 }">{{ index + 1 }}</span>
            <span class="topic-name">#{{ item.topic }}#</span>
            <span class="topic-count">{{ formatCount(item.count) }}</span>
          </button>
        </li>
      </ol>
      <p v-else class="side-placeholder">还没有话题，发帖时带上 #话题# 吧</p>
    </section>

    <section class="side-card">
      <h3 class="side-title">
        <TeamOutlined class="title-icon" />
        在线同志
        <span class="online-count">({{ onlineCount }})</span>
      </h3>
      <div v-if="visibleOnline.length" class="online-list">
        <button v-for="user in visibleOnline" :key="user.id" class="online-row" type="button" @click="goProfile(user)">
          <span class="avatar-wrap">
            <UserAvatar :user="user" :size="36" />
            <i class="online-dot" aria-label="在线"></i>
          </span>
          <span class="online-name">{{ user.nickname }}</span>
        </button>
      </div>
      <p v-else class="side-placeholder">暂时没有同志在线</p>
      <a-popover v-if="onlineUsers.length > visibleOnline.length" placement="bottom" trigger="click">
        <template #content>
          <div class="all-online">
            <button v-for="user in onlineUsers" :key="`all-${user.id}`" class="online-row" type="button" @click="goProfile(user)">
              <UserAvatar :user="user" :size="28" />
              <span class="online-name">{{ user.nickname }}</span>
            </button>
          </div>
        </template>
        <button class="view-all" type="button">查看全部 {{ onlineCount }} 位同志 →</button>
      </a-popover>
    </section>

    <section class="side-card">
      <h3 class="side-title">
        <BarChartOutlined class="title-icon" />
        社区数据
      </h3>
      <dl class="stats-list">
        <div class="stats-row">
          <dt>注册同志</dt>
          <dd>{{ community ? formatStat(community.users) : '—' }}</dd>
        </div>
        <div class="stats-row">
          <dt>今日新增</dt>
          <dd class="accent">{{ community ? formatStat(community.todayNewUsers) : '—' }}</dd>
        </div>
        <div class="stats-row">
          <dt>今日发帖</dt>
          <dd>{{ community ? formatStat(community.todayPosts) : '—' }}</dd>
        </div>
        <div class="stats-row">
          <dt>馆藏图书</dt>
          <dd>{{ community ? formatStat(community.books) : '—' }}</dd>
        </div>
      </dl>
    </section>

    <p class="sidebar-slogan">为了新世界，学习理论，团结同志。</p>
  </aside>
</template>

<style scoped>
.right-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.side-card {
  padding: 16px;
  background: #fff;
  border-radius: var(--rl-radius-card);
  box-shadow: var(--rl-shadow);
}

.side-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 12px;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.title-icon {
  color: var(--rl-primary);
  font-size: 15px;
}

.title-icon.fire {
  color: #d4af37;
}

.online-count {
  color: var(--rl-text-secondary);
  font-family: var(--rl-sans);
  font-size: 12px;
  font-weight: 400;
}

.side-placeholder {
  margin: 4px 0;
  color: var(--rl-text-secondary);
  font-size: 12px;
  line-height: 1.8;
}

.topic-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.topic-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.topic-row:hover {
  background: #fff8f7;
}

.topic-rank {
  flex: 0 0 16px;
  color: var(--rl-text-secondary);
  font-family: 'Georgia', serif;
  font-size: 14px;
  text-align: center;
}

.topic-rank.top {
  color: var(--rl-deep);
  font-weight: 700;
}

.topic-name {
  overflow: hidden;
  flex: 1;
  color: var(--rl-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topic-count {
  color: var(--rl-text-secondary);
  font-size: 12px;
}

.online-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.online-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.online-row:hover {
  background: #fff8f7;
}

.avatar-wrap {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}

.online-dot {
  position: absolute;
  right: 0;
  bottom: 1px;
  width: 9px;
  height: 9px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--rl-success);
}

.online-name {
  overflow: hidden;
  color: var(--rl-text-tertiary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.view-all {
  margin-top: 8px;
  padding: 4px 0;
  border: none;
  background: transparent;
  color: var(--rl-primary);
  font-size: 12px;
  cursor: pointer;
}

.all-online {
  display: flex;
  max-height: 260px;
  min-width: 160px;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.stats-list {
  margin: 0;
}

.stats-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 0;
  font-size: 13px;
}

.stats-row dt {
  color: var(--rl-text-secondary);
}

.stats-row dd {
  margin: 0;
  color: var(--rl-text);
  font-weight: 600;
}

.stats-row dd.accent {
  color: var(--rl-primary);
}

.sidebar-slogan {
  padding: 2px 4px;
  color: #b3a489;
  font-family: var(--rl-serif);
  font-size: 12px;
  letter-spacing: 1px;
  text-align: center;
}
</style>
