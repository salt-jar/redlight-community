<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { SearchOutlined } from '@ant-design/icons-vue';
import { apiSearchAll } from '@/api/search';
import { debounce } from '@/utils/debounce';
import type { Book, User } from '@/types';

const router = useRouter();
const route = useRoute();

const q = ref('');
const open = ref(false);
const loading = ref(false);
const books = ref<Book[]>([]);
const users = ref<User[]>([]);
const root = ref<HTMLElement | null>(null);
let requestSeq = 0;

async function runSearch() {
  const keyword = q.value.trim();
  if (!keyword) {
    books.value = [];
    users.value = [];
    open.value = false;
    return;
  }
  const seq = ++requestSeq;
  loading.value = true;
  open.value = true;
  try {
    const result = await apiSearchAll(keyword);
    if (seq !== requestSeq) return;
    books.value = result.books;
    users.value = result.users;
  } catch {
    if (seq === requestSeq) {
      books.value = [];
      users.value = [];
    }
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

const debouncedSearch = debounce(runSearch, 300);

function onInput() {
  open.value = true;
  void debouncedSearch();
}

function submit() {
  const keyword = q.value.trim();
  if (!keyword) return;
  debouncedSearch.cancel();
  open.value = false;
  router.push({ path: '/search', query: { q: keyword } });
}

function goBook(book: Book) {
  open.value = false;
  router.push(`/books/${book.id}`);
}

function goUser(user: User) {
  open.value = false;
  router.push(`/profile/${user.id}`);
}

function onDocumentClick(event: MouseEvent) {
  if (root.value && event.target instanceof Node && !root.value.contains(event.target)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  debouncedSearch.cancel();
});
</script>

<template>
  <div ref="root" class="global-search" data-testid="global-search">
    <a-input
      v-model:value="q"
      class="search-input"
      placeholder="搜索书名 / 作者 / 昵称..."
      allow-clear
      data-testid="global-search-input"
      @input="onInput"
      @focus="open = Boolean(q.trim())"
      @press-enter="submit"
    >
      <template #prefix>
        <SearchOutlined class="search-icon" />
      </template>
    </a-input>

    <transition name="fade">
      <div v-if="open && q.trim()" class="search-panel" data-testid="search-panel">
        <div v-if="loading" class="search-loading">搜索中...</div>
        <template v-else>
          <section v-if="books.length" class="result-group">
            <h4 class="group-title">📚 图书结果</h4>
            <button v-for="book in books" :key="`book-${book.id}`" class="result-item" type="button" @click="goBook(book)">
              <img class="book-thumb" :src="book.coverUrl" :alt="book.title" />
              <span class="result-meta">
                <span class="result-name">{{ book.title }}</span>
                <span class="result-desc">{{ book.author || '佚名' }} · {{ book.fileFormat.toUpperCase() }}</span>
              </span>
            </button>
          </section>

          <section v-if="users.length" class="result-group">
            <h4 class="group-title">👤 用户结果</h4>
            <button v-for="user in users" :key="`user-${user.id}`" class="result-item" type="button" @click="goUser(user)">
              <span class="user-thumb">{{ (user.nickname || '同').slice(0, 1) }}</span>
              <span class="result-meta">
                <span class="result-name">{{ user.nickname }}</span>
                <span class="result-desc">{{ user.bio || '赤光社同志' }}</span>
              </span>
            </button>
          </section>

          <div v-if="!books.length && !users.length" class="no-result">没有找到「{{ q.trim() }}」相关内容</div>

          <button class="see-all" type="button" @click="submit">
            回车查看全部结果
            <span class="enter-key">↵</span>
          </button>
        </template>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.global-search {
  position: relative;
  width: 100%;
}

.global-search :deep(.ant-input-affix-wrapper) {
  height: 34px;
  border: none;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.18);
  box-shadow: none;
  color: #fff;
}

.global-search :deep(.ant-input) {
  background: transparent;
  color: #fff;
  font-size: 13px;
}

.global-search :deep(.ant-input::placeholder) {
  color: rgba(255, 255, 255, 0.76);
}

.global-search :deep(.ant-input-clear-icon) {
  color: rgba(255, 255, 255, 0.8);
}

.search-icon {
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
}

.search-panel {
  position: absolute;
  top: 42px;
  left: 0;
  right: 0;
  z-index: 120;
  min-width: 360px;
  padding: 8px;
  background: #fff;
  border: 1px solid var(--rl-border);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(80, 40, 20, 0.14);
  color: var(--rl-text);
}

.search-loading,
.no-result {
  padding: 18px 12px;
  text-align: center;
  color: var(--rl-text-secondary);
  font-size: 13px;
}

.result-group {
  padding: 4px 0 6px;
}

.result-group + .result-group {
  border-top: 1px solid var(--rl-border-light);
}

.group-title {
  margin: 0;
  padding: 6px 8px;
  color: var(--rl-text-secondary);
  font-size: 12px;
  font-weight: 400;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.result-item:hover {
  background: #fff8f7;
}

.book-thumb {
  width: 28px;
  height: 38px;
  border-radius: 3px;
  object-fit: cover;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

.user-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #8b0000;
  color: #fff;
  font-size: 13px;
}

.result-meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.result-name {
  overflow: hidden;
  color: var(--rl-text);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-desc {
  overflow: hidden;
  color: var(--rl-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.see-all {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 4px;
  padding: 9px;
  border: none;
  border-top: 1px solid var(--rl-border-light);
  background: transparent;
  color: var(--rl-primary);
  font-size: 12px;
  cursor: pointer;
}

.enter-key {
  padding: 0 4px;
  border: 1px solid var(--rl-border);
  border-radius: 3px;
  color: var(--rl-text-secondary);
  font-size: 11px;
}

@media (max-width: 767px) {
  .search-panel {
    position: fixed;
    top: 58px;
    left: 12px;
    right: 12px;
    min-width: 0;
  }
}
</style>
