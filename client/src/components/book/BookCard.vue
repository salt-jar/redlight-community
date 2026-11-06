<script setup lang="ts">
import { useRouter } from 'vue-router';
import { DownloadOutlined, ReadOutlined } from '@ant-design/icons-vue';
import type { Book } from '@/types';
import { formatCount, formatFileSize } from '@/utils/format';

const props = defineProps<{ book: Book }>();
const router = useRouter();

function openDetail() {
  void router.push(`/books/${props.book.id}`);
}

function openReader() {
  void router.push(`/books/${props.book.id}/preview`);
}
</script>

<template>
  <article class="book-card" data-testid="book-card" :data-book-id="book.id" @click="openDetail">
    <div class="cover-wrap">
      <img :src="book.coverUrl" :alt="book.title" class="cover" loading="lazy" />
      <span class="format-badge">{{ book.fileFormat.toUpperCase() }}</span>
      <div class="cover-overlay">
        <button class="overlay-btn" type="button" @click.stop="openReader">
          <ReadOutlined />
          在线阅读
        </button>
      </div>
    </div>
    <div class="book-meta">
      <h3 class="book-title" :title="book.title">{{ book.title }}</h3>
      <p class="book-author">{{ book.author || '佚名' }}</p>
      <div class="book-foot">
        <span class="book-category">{{ book.category || '未分类' }}</span>
        <span class="book-downloads"><DownloadOutlined /> {{ formatCount(book.downloadCount) }}</span>
      </div>
      <p class="book-size">{{ formatFileSize(book.fileSize) }}</p>
    </div>
  </article>
</template>

<style scoped>
.book-card {
  overflow: hidden;
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--rl-shadow);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.book-card:hover {
  box-shadow: var(--rl-shadow-hover);
  transform: translateY(-2px);
}

.cover-wrap {
  position: relative;
  overflow: hidden;
  aspect-ratio: 3 / 4;
  background: #efe7d9;
}

.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.format-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(139, 0, 0, 0.82);
  color: #fff;
  font-size: 10px;
  letter-spacing: 0.5px;
}

.cover-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 16px;
  background: linear-gradient(180deg, transparent 45%, rgba(30, 10, 10, 0.55));
  opacity: 0;
  transition: opacity 0.2s ease;
}

.book-card:hover .cover-overlay {
  opacity: 1;
}

.overlay-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 6px;
  background: rgba(200, 16, 46, 0.9);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.book-meta {
  padding: 10px 12px 12px;
}

.book-title {
  overflow: hidden;
  margin: 0;
  color: var(--rl-text);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-author {
  overflow: hidden;
  margin: 2px 0 0;
  color: var(--rl-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.book-category {
  padding: 0 6px;
  border-radius: 3px;
  background: #fdf1e4;
  color: #946b2d;
  font-size: 10px;
  line-height: 18px;
}

.book-downloads {
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.book-size {
  margin: 4px 0 0;
  color: #b3a489;
  font-size: 10px;
}
</style>
