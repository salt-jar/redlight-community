<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { SearchOutlined } from '@ant-design/icons-vue';
import AppShell from '@/components/layout/AppShell.vue';
import BookCard from '@/components/book/BookCard.vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { apiSearchAll, apiSearchBooks, apiSearchUsers } from '@/api/search';
import { apiErrorMessage } from '@/api/http';
import type { Book, User } from '@/types';

type TabKey = 'all' | 'books' | 'users';

const route = useRoute();
const router = useRouter();

const q = ref('');
const draft = ref('');
const tab = ref<TabKey>('all');
const loading = ref(false);
const error = ref('');
const books = ref<Book[]>([]);
const users = ref<User[]>([]);
const bookTotal = ref(0);
const userTotal = ref(0);
const bookPage = ref(1);
const userPage = ref(1);
const pageSize = 12;

const hasQuery = computed(() => Boolean(q.value.trim()));
const totalCount = computed(() => bookTotal.value + userTotal.value);

async function load() {
  const keyword = q.value.trim();
  if (!keyword) {
    books.value = [];
    users.value = [];
    bookTotal.value = 0;
    userTotal.value = 0;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    if (tab.value === 'all') {
      const result = await apiSearchAll(keyword);
      books.value = result.books;
      users.value = result.users;
      bookTotal.value = result.books.length;
      userTotal.value = result.users.length;
    } else if (tab.value === 'books') {
      const result = await apiSearchBooks(keyword, bookPage.value, pageSize);
      books.value = result.list;
      bookTotal.value = result.total;
      users.value = [];
    } else {
      const result = await apiSearchUsers(keyword, userPage.value, pageSize);
      users.value = result.list;
      userTotal.value = result.total;
      books.value = [];
    }
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

function syncFromRoute() {
  q.value = typeof route.query.q === 'string' ? route.query.q : '';
  draft.value = q.value;
  const nextTab = String(route.query.tab || 'all');
  tab.value = nextTab === 'books' || nextTab === 'users' ? nextTab : 'all';
  bookPage.value = 1;
  userPage.value = 1;
}

function submitSearch() {
  const keyword = draft.value.trim();
  if (!keyword) return;
  void router.push({ path: '/search', query: { q: keyword, tab: 'all' } });
}

function switchTab(next: TabKey) {
  if (tab.value === next) return;
  tab.value = next;
  bookPage.value = 1;
  userPage.value = 1;
  void router.replace({ path: '/search', query: { ...route.query, q: q.value, tab: next } });
}

function changeBookPage(next: number) {
  bookPage.value = next;
  void load();
}

function changeUserPage(next: number) {
  userPage.value = next;
  void load();
}

function goProfile(user: User) {
  void router.push(`/profile/${user.id}`);
}

watch(
  () => route.query,
  () => {
    syncFromRoute();
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <AppShell :show-right="false">
    <header class="search-head" data-testid="search-page">
      <h1 class="page-title">搜索结果</h1>
      <p v-if="hasQuery" class="page-subtitle">
        关键词「<strong class="keyword">{{ q.trim() }}</strong>」
        <template v-if="!loading"> · 共 {{ totalCount }} 条结果</template>
      </p>
      <p v-else class="page-subtitle">在顶栏搜索框中输入书名、作者或同志昵称</p>

      <form class="search-bar" @submit.prevent="submitSearch">
        <a-input
          v-model:value="draft"
          size="large"
          allow-clear
          placeholder="搜索书名 / 作者 / 同志昵称..."
          data-testid="search-page-input"
        >
          <template #prefix><SearchOutlined class="search-bar-icon" /></template>
        </a-input>
        <button class="search-bar-btn" type="submit" data-testid="search-page-submit">搜索</button>
      </form>
    </header>

    <div v-if="hasQuery" class="result-tabs" data-testid="search-tabs">
      <button
        class="tab-btn"
        :class="{ active: tab === 'all' }"
        type="button"
        data-testid="search-tab-all"
        @click="switchTab('all')"
      >
        全部
      </button>
      <button
        class="tab-btn"
        :class="{ active: tab === 'books' }"
        type="button"
        data-testid="search-tab-books"
        @click="switchTab('books')"
      >
        图书
      </button>
      <button
        class="tab-btn"
        :class="{ active: tab === 'users' }"
        type="button"
        data-testid="search-tab-users"
        @click="switchTab('users')"
      >
        用户
      </button>
    </div>

    <div v-if="loading" class="page-card search-loading">正在搜索...</div>

    <div v-else-if="error" class="page-card search-error">
      <p>{{ error }}</p>
      <a-button type="primary" @click="load">重新搜索</a-button>
    </div>

    <template v-else-if="hasQuery">
      <EmptyState
        v-if="books.length === 0 && users.length === 0"
        icon="search"
        title="没有找到相关内容"
        desc="换一个关键词试试，或去图书库、同志们的主页看看。"
        data-testid="search-empty"
      />

      <template v-else>
        <section v-if="books.length" class="result-section">
          <h2 class="section-title">图书 <span class="section-count">{{ bookTotal }}</span></h2>
          <div class="book-grid" data-testid="search-book-grid">
            <BookCard v-for="book in books" :key="book.id" :book="book" />
          </div>
          <div v-if="tab === 'books' && bookTotal > pageSize" class="pager">
            <a-pagination :current="bookPage" :page-size="pageSize" :total="bookTotal" @change="changeBookPage" />
          </div>
        </section>

        <section v-if="users.length" class="result-section">
          <h2 class="section-title">同志 <span class="section-count">{{ userTotal }}</span></h2>
          <div class="user-grid" data-testid="search-user-list">
            <button v-for="user in users" :key="user.id" class="user-card" type="button" @click="goProfile(user)">
              <UserAvatar :user="user" :size="48" />
              <div class="user-info">
                <span class="user-name">{{ user.nickname }}</span>
                <span class="user-bio">{{ user.bio || '赤光社同志' }}</span>
                <span class="user-handle">
                  @{{ user.username || '—' }}
                  <template v-if="user.communityNo"> · 社区号 {{ user.communityNo }}</template>
                </span>
              </div>
              <span class="user-arrow">查看主页 →</span>
            </button>
          </div>
          <div v-if="tab === 'users' && userTotal > pageSize" class="pager">
            <a-pagination :current="userPage" :page-size="pageSize" :total="userTotal" @change="changeUserPage" />
          </div>
        </section>
      </template>
    </template>

    <EmptyState v-else icon="search" title="搜索赤光社" desc="支持书名、作者、简介与同志昵称。" />
  </AppShell>
</template>

<style scoped>
.search-head {
  margin: 2px 2px 14px;
}

.keyword {
  color: var(--rl-primary);
  font-weight: 600;
}

.search-bar {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding: 12px 16px;
  border: 1px solid var(--rl-border-light);
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--rl-shadow);
}

.search-bar :deep(.ant-input-affix-wrapper) {
  border-color: var(--rl-border);
  background: #fbf9f5;
}

.search-bar-icon {
  color: #c2b39a;
}

.search-bar-btn {
  flex: 0 0 auto;
  padding: 0 22px;
  border: 1px solid var(--rl-primary);
  border-radius: 6px;
  background: var(--rl-primary);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.search-bar-btn:hover {
  background: var(--rl-primary-hover);
}

.result-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--rl-border);
}

.tab-btn {
  position: relative;
  padding: 8px 18px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--rl-text-tertiary);
  font-size: 14px;
  cursor: pointer;
}

.tab-btn:hover {
  color: var(--rl-primary);
}

.tab-btn.active {
  border-bottom-color: var(--rl-primary);
  color: var(--rl-primary);
  font-weight: 600;
}

.search-loading,
.search-error {
  padding: 32px;
  color: var(--rl-text-secondary);
  text-align: center;
}

.result-section {
  margin-bottom: 24px;
}

.section-count {
  color: var(--rl-text-secondary);
  font-family: var(--rl-sans);
  font-size: 12px;
  font-weight: 400;
}

.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
  margin-top: 12px;
}

.user-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin-top: 12px;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--rl-border);
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--rl-shadow);
  cursor: pointer;
  text-align: left;
}

.user-card:hover {
  border-color: #f0c9cf;
  box-shadow: 0 3px 12px rgba(80, 40, 20, 0.08);
}

.user-info {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.user-name {
  overflow: hidden;
  color: var(--rl-text);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-bio {
  overflow: hidden;
  color: var(--rl-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-handle {
  overflow: hidden;
  color: #b3a489;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-arrow {
  flex: 0 0 auto;
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.pager {
  display: flex;
  justify-content: center;
  margin-top: 18px;
}

@media (max-width: 767px) {
  .book-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .user-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
