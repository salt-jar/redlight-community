<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { UploadOutlined } from '@ant-design/icons-vue';
import AppShell from '@/components/layout/AppShell.vue';
import BookCard from '@/components/book/BookCard.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { apiGetBooks } from '@/api/books';
import { apiErrorMessage } from '@/api/http';
import type { Book } from '@/types';

const router = useRouter();
const categories = ['全部', '马恩著作', '列宁著作', '哲学', '政治经济学', '科学社会主义', '党史', '历史', '其他'];

const books = ref<Book[]>([]);
const category = ref('全部');
const page = ref(1);
const size = 12;
const total = ref(0);
const loading = ref(true);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await apiGetBooks({
      page: page.value,
      size,
      category: category.value === '全部' ? '' : category.value,
    });
    books.value = result.list;
    total.value = result.total;
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

function selectCategory(next: string) {
  if (category.value === next) return;
  category.value = next;
  page.value = 1;
  void load();
}

function onPageChange(next: number) {
  page.value = next;
  void load();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

onMounted(load);
</script>

<template>
  <AppShell :show-right="false">
    <header class="books-hero">
      <div>
        <h1 class="page-title">赤光文献馆</h1>
        <p class="page-subtitle">马恩列斯经典著作与理论学习资料，在线阅读、自由下载</p>
      </div>
      <button class="hero-upload" type="button" data-testid="books-upload" @click="router.push('/upload')">
        <UploadOutlined />
        上传图书
      </button>
    </header>

    <nav class="category-bar" data-testid="book-categories">
      <button
        v-for="item in categories"
        :key="item"
        class="category-chip"
        :class="{ active: category === item }"
        type="button"
        :data-category="item"
        @click="selectCategory(item)"
      >
        {{ item }}
      </button>
    </nav>

    <div v-if="loading" class="book-grid">
      <div v-for="index in 6" :key="index" class="book-skeleton">
        <span class="cover-skeleton"></span>
        <span class="line-skeleton"></span>
        <span class="line-skeleton short"></span>
      </div>
    </div>

    <div v-else-if="error" class="page-card books-error">
      <p>{{ error }}</p>
      <a-button type="primary" @click="load">重新加载</a-button>
    </div>

    <EmptyState
      v-else-if="books.length === 0"
      icon="book"
      title="这个分类还没有藏书"
      desc="上传一份 PDF 或 EPUB 压缩包，与同志们共享经典。"
    >
      <a-button type="primary" @click="router.push('/upload')">上传第一本图书</a-button>
    </EmptyState>

    <template v-else>
      <div class="book-grid" data-testid="books-grid">
        <BookCard v-for="book in books" :key="book.id" :book="book" />
      </div>
      <div class="pagination-wrap">
        <a-pagination
          v-if="total > size"
          :current="page"
          :page-size="size"
          :total="total"
          show-less-items
          data-testid="books-pagination"
          @change="onPageChange"
        />
        <p class="shelf-count">馆藏共 {{ total }} 册</p>
      </div>
    </template>
  </AppShell>
</template>

<style scoped>
.books-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin: 2px 2px 14px;
}

.hero-upload {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--rl-primary);
  border-radius: 6px;
  background: #fff;
  color: var(--rl-primary);
  font-size: 13px;
  cursor: pointer;
}

.hero-upload:hover {
  background: var(--rl-primary);
  color: #fff;
}

.category-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--rl-shadow);
}

.category-chip {
  padding: 4px 12px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  color: var(--rl-text-tertiary);
  font-size: 13px;
  cursor: pointer;
}

.category-chip:hover {
  background: #fff1f0;
  color: var(--rl-primary);
}

.category-chip.active {
  border-color: #f3c6cc;
  background: #fff1f0;
  color: var(--rl-primary);
  font-weight: 600;
}

.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
}

.book-skeleton {
  overflow: hidden;
  padding-bottom: 12px;
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--rl-shadow);
}

.cover-skeleton {
  display: block;
  aspect-ratio: 3 / 4;
  background: linear-gradient(90deg, #f1ece4 25%, #faf7f2 37%, #f1ece4 63%);
  background-size: 400% 100%;
  animation: skeleton-loading 1.4s ease infinite;
}

.line-skeleton {
  display: block;
  width: 70%;
  height: 10px;
  margin: 10px 12px 0;
  border-radius: 3px;
  background: #f1ece4;
}

.line-skeleton.short {
  width: 45%;
  margin-top: 7px;
}

@keyframes skeleton-loading {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

.pagination-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
}

.shelf-count {
  color: var(--rl-text-secondary);
  font-size: 12px;
}

.books-error {
  text-align: center;
}

.books-error p {
  margin-bottom: 12px;
  color: var(--rl-text-secondary);
}

@media (max-width: 767px) {
  .books-hero {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .book-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .pagination-wrap {
    flex-direction: column;
    gap: 10px;
  }
}
</style>
