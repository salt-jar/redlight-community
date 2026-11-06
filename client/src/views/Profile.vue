<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { CalendarOutlined, EditOutlined, FileTextOutlined } from '@ant-design/icons-vue';
import AppShell from '@/components/layout/AppShell.vue';
import PostCard from '@/components/post/PostCard.vue';
import PostSkeleton from '@/components/skeleton/PostSkeleton.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { apiGetProfile } from '@/api/users';
import { apiErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import type { Post, User } from '@/types';
import { formatDate } from '@/utils/format';

const route = useRoute();
const auth = useAuthStore();
const ui = useUiStore();

const user = ref<User | null>(null);
const posts = ref<Post[]>([]);
const page = ref(1);
const total = ref(0);
const hasMore = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref('');

const isSelf = computed(() => Boolean(user.value && auth.user && user.value.id === auth.user.id));

async function load(targetPage = 1, replace = true) {
  if (replace) loading.value = true;
  else loadingMore.value = true;
  error.value = '';
  try {
    const result = await apiGetProfile(Number(route.params.id), targetPage, 10);
    user.value = result.user;
    posts.value = replace ? result.posts : [...posts.value, ...result.posts];
    page.value = result.page;
    total.value = result.total;
    hasMore.value = result.hasMore;
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function onNewPost(post: Post) {
  posts.value = [post, ...posts.value];
  total.value += 1;
}

watch(
  () => route.params.id,
  () => {
    posts.value = [];
    total.value = 0;
    void load(1, true);
  },
  { immediate: true },
);

// 在页内编辑资料后，立即同步当前主页展示
watch(
  () => auth.user,
  (next) => {
    if (next && user.value && next.id === user.value.id) {
      user.value = { ...user.value, nickname: next.nickname, avatarUrl: next.avatarUrl };
      posts.value = posts.value.map((post) =>
        post.user.id === next.id
          ? { ...post, user: { ...post.user, nickname: next.nickname, avatarUrl: next.avatarUrl } }
          : post,
      );
    }
  },
  { deep: true },
);
</script>

<template>
  <AppShell :show-right="false">
    <div v-if="loading" class="profile-skeleton page-card">
      <span class="avatar-skeleton"></span>
      <div class="skeleton-lines">
        <span class="line"></span>
        <span class="line short"></span>
      </div>
    </div>

    <EmptyState v-else-if="error || !user" icon="bell" title="没有找到这位同志" :desc="error">
      <a-button type="primary" @click="$router.push('/')">回到首页</a-button>
    </EmptyState>

    <template v-else>
      <section class="profile-head page-card" data-testid="profile-card">
        <UserAvatar :user="user" :size="76" />
        <div class="profile-info">
          <div class="name-row">
            <h1 class="profile-name" data-testid="profile-nickname">{{ user.nickname }}</h1>
            <span v-if="isSelf" class="self-badge">我的主页</span>
          </div>
          <p class="profile-bio">{{ user.bio || '这位同志还没有填写简介。' }}</p>
          <p class="profile-join">
            <CalendarOutlined />
            {{ formatDate(user.createdAt || '') }} 加入赤光社
          </p>
          <button
            v-if="isSelf"
            class="edit-profile-btn"
            type="button"
            data-testid="edit-profile"
            @click="ui.openProfileEditor()"
          >
            <EditOutlined />
            编辑资料
          </button>
        </div>
        <div class="profile-stat">
          <strong>{{ total }}</strong>
          <span>动态</span>
        </div>
      </section>

      <h2 class="posts-title">
        <FileTextOutlined />
        {{ isSelf ? '我的动态' : 'TA 的动态' }}
      </h2>

      <div v-if="posts.length === 0" class="page-card" data-testid="profile-empty">
        <EmptyState icon="wheat" title="还没有发布过动态" desc="读一本书，写一段思考，和同志们交流。" />
      </div>

      <template v-else>
        <div class="profile-posts" data-testid="profile-posts">
          <PostCard v-for="post in posts" :key="post.id" :post="post" @reposted="onNewPost" />
        </div>
        <div class="load-more-wrap">
          <a-button v-if="hasMore" :loading="loadingMore" data-testid="profile-load-more" @click="load(page + 1, false)">
            加载更多
          </a-button>
          <p v-else class="no-more">— 已经到底啦 —</p>
        </div>
      </template>
    </template>
  </AppShell>
</template>

<style scoped>
.profile-skeleton {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar-skeleton {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: #f1ece4;
}

.skeleton-lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
}

.line {
  width: 60%;
  height: 14px;
  border-radius: 4px;
  background: #f1ece4;
}

.line.short {
  width: 35%;
  height: 11px;
}

.profile-head {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
}

.profile-info {
  min-width: 0;
  flex: 1;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-name {
  overflow: hidden;
  margin: 0;
  color: var(--rl-text);
  font-family: var(--rl-serif);
  font-size: 24px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.self-badge {
  padding: 0 7px;
  border-radius: 3px;
  background: #fff1f0;
  color: var(--rl-primary);
  font-size: 11px;
  line-height: 18px;
}

.profile-bio {
  margin: 4px 0 0;
  color: var(--rl-text-secondary);
  font-size: 13px;
}

.profile-join {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 6px 0 0;
  color: #b3a489;
  font-size: 11px;
}

.edit-profile-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 3px 10px;
  border: 1px solid #f0c9cf;
  border-radius: 5px;
  background: #fff8f7;
  color: var(--rl-primary);
  font-size: 12px;
  cursor: pointer;
}

.edit-profile-btn:hover {
  background: #fff1f0;
}

.profile-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-left: 20px;
  border-left: 1px solid var(--rl-border);
}

.profile-stat strong {
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 26px;
  line-height: 1.2;
}

.profile-stat span {
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.posts-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 18px 2px 10px;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 17px;
}

.load-more-wrap {
  padding: 8px 0;
  text-align: center;
}

@media (max-width: 767px) {
  .profile-head {
    align-items: flex-start;
    gap: 14px;
    padding: 18px;
  }

  .profile-name {
    font-size: 20px;
  }

  .profile-stat {
    padding-left: 12px;
  }
}
</style>
