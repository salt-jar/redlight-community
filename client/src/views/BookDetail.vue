<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeftOutlined, DownloadOutlined, ReadOutlined } from '@ant-design/icons-vue';
import AppShell from '@/components/layout/AppShell.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { apiGetBook, bookDownloadUrl } from '@/api/books';
import { apiErrorMessage } from '@/api/http';
import type { Book } from '@/types';
import { formatCount, formatDate, formatFileSize } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const book = ref<Book | null>(null);
const loading = ref(true);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    book.value = await apiGetBook(Number(route.params.id));
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <AppShell :show-right="false">
    <button class="back-link" type="button" @click="router.push('/books')">
      <ArrowLeftOutlined /> 返回文献馆
    </button>

    <div v-if="loading" class="page-card detail-loading">图书信息加载中...</div>

    <EmptyState v-else-if="error || !book" icon="book" title="没有找到这本书" :desc="error">
      <a-button type="primary" @click="router.push('/books')">回到图书库</a-button>
    </EmptyState>

    <template v-else>
      <article class="detail-card" data-testid="book-detail">
        <div class="cover-column">
          <img class="detail-cover" :src="book.coverUrl" :alt="book.title" />
          <span class="format-tag">{{ book.fileFormat.toUpperCase() }}</span>
        </div>

        <div class="info-column">
          <span class="category-tag">{{ book.category || '未分类' }}</span>
          <h1 class="book-title" data-testid="book-title">{{ book.title }}</h1>
          <p class="book-author">{{ book.author || '佚名' }}</p>

          <dl class="meta-grid">
            <div>
              <dt>文件大小</dt>
              <dd>{{ formatFileSize(book.fileSize) }}</dd>
            </div>
            <div>
              <dt>下载次数</dt>
              <dd>{{ formatCount(book.downloadCount) }}</dd>
            </div>
            <div>
              <dt>上架时间</dt>
              <dd>{{ formatDate(book.createdAt) }}</dd>
            </div>
            <div>
              <dt>上传同志</dt>
              <dd>
                <router-link v-if="book.uploader" :to="`/profile/${book.uploader.id}`">
                  {{ book.uploader.nickname }}
                </router-link>
                <span v-else>赤光社</span>
              </dd>
            </div>
          </dl>

          <div class="action-row">
            <button
              class="read-btn"
              type="button"
              data-testid="read-online"
              @click="router.push(`/books/${book.id}/preview`)"
            >
              <ReadOutlined />
              在线阅读
            </button>
            <a
              class="download-btn"
              :href="bookDownloadUrl(book.id)"
              data-testid="download-book"
              download
            >
              <DownloadOutlined />
              下载本书
            </a>
          </div>

          <p class="copyright-note">
            文献仅供学习交流使用，请支持正版；上传者应确保文献属于公有领域或已获得授权。
          </p>
        </div>
      </article>

      <section class="description-card">
        <h3 class="section-title">内容简介</h3>
        <p class="description">{{ book.description || '这本书还没有填写简介。' }}</p>
      </section>
    </template>
  </AppShell>
</template>

<style scoped>
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 12px 2px;
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--rl-text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.back-link:hover {
  background: #fff1f0;
  color: var(--rl-primary);
}

.detail-loading {
  padding: 60px;
  color: var(--rl-text-secondary);
  text-align: center;
}

.detail-card {
  display: flex;
  gap: 28px;
  padding: 24px;
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--rl-shadow);
}

.cover-column {
  position: relative;
  flex: 0 0 220px;
}

.detail-cover {
  width: 220px;
  aspect-ratio: 3 / 4;
  border-radius: 6px;
  object-fit: cover;
  box-shadow: 0 8px 22px rgba(70, 40, 20, 0.18);
}

.format-tag {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 2px 7px;
  border-radius: 3px;
  background: rgba(139, 0, 0, 0.85);
  color: #fff;
  font-size: 10px;
}

.info-column {
  min-width: 0;
  flex: 1;
}

.category-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 3px;
  background: #fdf1e4;
  color: #946b2d;
  font-size: 11px;
}

.book-title {
  margin: 8px 0 0;
  color: var(--rl-text);
  font-family: var(--rl-serif);
  font-size: 28px;
  font-weight: 700;
  line-height: 1.4;
}

.book-author {
  margin: 4px 0 0;
  color: var(--rl-text-secondary);
  font-size: 14px;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 20px;
  margin: 18px 0;
  padding: 14px 16px;
  border-radius: 6px;
  background: #fbf9f5;
}

.meta-grid dt {
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.meta-grid dd {
  margin: 1px 0 0;
  color: var(--rl-text);
  font-size: 13px;
  font-weight: 500;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.read-btn,
.download-btn {
  display: inline-flex;
  height: 38px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 20px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.read-btn {
  border: 1px solid var(--rl-primary);
  background: var(--rl-primary);
  color: #fff;
}

.read-btn:hover {
  background: var(--rl-primary-hover);
}

.download-btn {
  border: 1px solid var(--rl-border);
  background: #fff;
  color: var(--rl-text-tertiary);
}

.download-btn:hover {
  border-color: var(--rl-primary);
  color: var(--rl-primary);
}

.copyright-note {
  margin-top: 14px;
  color: #b3a489;
  font-size: 11px;
  line-height: 1.7;
}

.description-card {
  margin-top: 12px;
  padding: 20px 24px;
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--rl-shadow);
}

.description {
  margin: 12px 0 0;
  color: var(--rl-text-tertiary);
  font-size: 14px;
  line-height: 1.9;
  white-space: pre-wrap;
}

@media (max-width: 767px) {
  .detail-card {
    flex-direction: column;
    gap: 18px;
    padding: 18px;
  }

  .cover-column {
    display: flex;
    justify-content: center;
  }

  .detail-cover {
    width: 170px;
  }

  .book-title {
    font-size: 22px;
  }
}
</style>
