<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { ArrowUpOutlined, EditOutlined, PictureOutlined, ReloadOutlined } from '@ant-design/icons-vue';
import AppShell from '@/components/layout/AppShell.vue';
import PostComposer from '@/components/post/PostComposer.vue';
import PostCard from '@/components/post/PostCard.vue';
import PostSkeleton from '@/components/skeleton/PostSkeleton.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { apiGetPosts } from '@/api/posts';
import { apiErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import type { Post } from '@/types';

const auth = useAuthStore();
const ui = useUiStore();

const posts = ref<Post[]>([]);
const page = ref(1);
const hasMore = ref(true);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref('');
const sentinel = ref<HTMLElement | null>(null);
const showBackTop = ref(false);
const pullDistance = ref(0);
const refreshing = ref(false);
let observer: IntersectionObserver | null = null;
let touchStartY = -1;

async function loadPage(targetPage: number, replace = false) {
  if (replace) {
    loading.value = true;
    error.value = '';
  } else {
    if (loadingMore.value || !hasMore.value) return;
    loadingMore.value = true;
  }
  try {
    const result = await apiGetPosts(targetPage, 20);
    posts.value = replace ? result.list : [...posts.value, ...result.list];
    page.value = result.page;
    hasMore.value = result.hasMore;
  } catch (err) {
    if (replace) error.value = apiErrorMessage(err);
    else message.error(apiErrorMessage(err));
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function refresh() {
  if (refreshing.value || loadingMore.value) return;
  refreshing.value = true;
  hasMore.value = true;
  await loadPage(1, true);
  refreshing.value = false;
  message.success('已刷新');
}

function onNewPost(post: Post) {
  posts.value = [post, ...posts.value.filter((item) => item.id !== post.id)];
}

function retry() {
  void loadPage(1, true);
}

function onScroll() {
  showBackTop.value = window.scrollY > 500;
}

function backToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onTouchStart(event: TouchEvent) {
  touchStartY = window.scrollY <= 0 ? event.touches[0]?.clientY ?? -1 : -1;
}

function onTouchMove(event: TouchEvent) {
  if (touchStartY < 0 || window.scrollY > 0) return;
  const distance = (event.touches[0]?.clientY ?? touchStartY) - touchStartY;
  pullDistance.value = distance > 0 ? Math.min(72, distance * 0.5) : 0;
}

function onTouchEnd() {
  if (pullDistance.value > 42 && !refreshing.value) void refresh();
  pullDistance.value = 0;
  touchStartY = -1;
}

onMounted(async () => {
  await loadPage(1, true);
  await nextTick();
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting) && hasMore.value && !loading.value && !loadingMore.value) {
        void loadPage(page.value + 1);
      }
    },
    { rootMargin: '240px 0px' },
  );
  if (sentinel.value) observer.observe(sentinel.value);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
});

onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('touchstart', onTouchStart);
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('touchend', onTouchEnd);
});
</script>

<template>
  <AppShell>
    <div v-if="pullDistance > 0 || refreshing" class="pull-indicator" :style="{ height: `${refreshing ? 36 : pullDistance}px` }">
      {{ refreshing ? '正在刷新...' : pullDistance > 42 ? '松开刷新' : '下拉刷新' }}
    </div>

    <section class="composer-trigger card" data-testid="composer-trigger" @click="ui.openComposer()">
      <UserAvatar :user="auth.user" :size="40" />
      <div class="trigger-input">
        <span>分享你的学习心得...</span>
      </div>
      <div class="trigger-tools">
        <span class="trigger-tool"><PictureOutlined /> 图片</span>
        <span class="trigger-tool"><EditOutlined /> 话题</span>
      </div>
    </section>

    <div class="feed-head">
      <h2 class="section-title">同志动态</h2>
      <button class="refresh-btn" type="button" :disabled="loading" @click="refresh">
        <ReloadOutlined :spin="refreshing" />
        刷新
      </button>
    </div>

    <div v-if="loading && posts.length === 0" data-testid="feed-skeleton">
      <PostSkeleton v-for="index in 4" :key="index" />
    </div>

    <div v-else-if="error" class="feed-error card">
      <p>{{ error }}</p>
      <a-button type="primary" @click="retry">重新加载</a-button>
    </div>

    <template v-else>
      <EmptyState
        v-if="posts.length === 0"
        icon="wheat"
        title="还没有动态，发第一条学习心得吧"
        desc="记录读书笔记、理论思考，或向同志们问好。"
      >
        <a-button type="primary" data-testid="empty-compose" @click="ui.openComposer()">发布动态</a-button>
      </EmptyState>

      <TransitionGroup v-else name="post-slide" tag="div" class="feed-list" data-testid="feed">
        <PostCard v-for="post in posts" :key="post.id" :post="post" @reposted="onNewPost" />
      </TransitionGroup>

      <div ref="sentinel" class="feed-sentinel" data-testid="feed-sentinel"></div>
      <div v-if="loadingMore" class="loading-more">加载中...</div>
      <div v-else-if="posts.length > 0 && !hasMore" class="no-more" data-testid="no-more">— 已经到底啦 —</div>
    </template>

    <button v-if="showBackTop" class="back-top" type="button" aria-label="回到顶部" data-testid="back-top" @click="backToTop">
      <ArrowUpOutlined />
    </button>

    <PostComposer @posted="onNewPost" />
  </AppShell>
</template>

<style scoped>
.pull-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--rl-text-secondary);
  font-size: 12px;
  transition: height 0.15s ease;
}

.composer-trigger {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  cursor: text;
  transition: box-shadow 0.2s ease;
}

.composer-trigger:hover {
  box-shadow: 0 4px 14px rgba(80, 40, 20, 0.08);
}

.trigger-input {
  flex: 1;
  padding: 9px 14px;
  border-radius: 18px;
  background: #fbf9f5;
  color: var(--rl-text-secondary);
  font-size: 14px;
}

.trigger-tools {
  display: flex;
  gap: 10px;
}

.trigger-tool {
  color: var(--rl-text-secondary);
  font-size: 12px;
}

.feed-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 2px 10px;
}

.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--rl-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.refresh-btn:hover {
  background: #fff1f0;
  color: var(--rl-primary);
}

.feed-error {
  padding: 30px;
  text-align: center;
}

.feed-error p {
  margin-bottom: 14px;
  color: var(--rl-text-secondary);
}

.feed-sentinel {
  height: 1px;
}

@media (max-width: 767px) {
  .trigger-tools {
    display: none;
  }
}
</style>
