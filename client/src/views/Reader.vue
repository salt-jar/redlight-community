<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeftOutlined,
  LeftOutlined,
  RightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import ePub from 'epubjs';
import { apiGetBook, bookFileUrl } from '@/api/books';
import { apiErrorMessage } from '@/api/http';
import type { Book } from '@/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

const route = useRoute();
const router = useRouter();

const book = ref<Book | null>(null);
const loading = ref(true);
const preparing = ref(true);
const error = ref('');
const pdfCanvas = ref<HTMLCanvasElement | null>(null);
const epubContainer = ref<HTMLElement | null>(null);
const pdfPage = ref(1);
const pdfPages = ref(0);
const pdfScale = ref(1);
const pdfRendering = ref(false);
const epubLocation = ref('');

let pdfDoc: any = null;
let epubBook: any = null;
let rendition: any = null;

const bookId = computed(() => Number(route.params.id));
const isPdf = computed(() => book.value?.fileFormat === 'pdf');
const isEpub = computed(() => book.value?.fileFormat === 'epub');

async function renderPdfPage() {
  if (!pdfDoc || !pdfCanvas.value) return;
  pdfRendering.value = true;
  try {
    const page = await pdfDoc.getPage(pdfPage.value);
    const viewport = page.getViewport({ scale: pdfScale.value });
    const canvas = pdfCanvas.value;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    const params: Record<string, unknown> = { canvasContext: context, viewport };
    if (ratio !== 1) params.transform = [ratio, 0, 0, ratio, 0, 0];
    await page.render(params).promise;
  } catch (err) {
    error.value = `PDF 页面渲染失败：${(err as Error).message}`;
  } finally {
    pdfRendering.value = false;
  }
}

async function loadPdf() {
  const task = pdfjsLib.getDocument({
    url: bookFileUrl(bookId.value),
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
  });
  pdfDoc = await task.promise;
  pdfPages.value = pdfDoc.numPages;
  pdfPage.value = 1;
  await nextTick();
  await renderPdfPage();
}

async function loadEpub() {
  await nextTick();
  if (!epubContainer.value) return;
  epubBook = ePub(bookFileUrl(bookId.value), { openAs: 'epub' });
  rendition = epubBook.renderTo(epubContainer.value, {
    width: '100%',
    height: '100%',
    flow: 'paginated',
    spread: 'none',
  });
  rendition.on('relocated', (location: any) => {
    epubLocation.value = location?.start?.href || '';
  });
  await rendition.display();
}

async function load() {
  loading.value = true;
  preparing.value = true;
  error.value = '';
  try {
    book.value = await apiGetBook(bookId.value);
    // 先让阅读容器渲染出来，再初始化 PDF.js / epub.js
    loading.value = false;
    await nextTick();
    if (book.value.fileFormat === 'pdf') await loadPdf();
    else if (book.value.fileFormat === 'epub') await loadEpub();
    else error.value = '暂不支持该格式的在线阅读';
  } catch (err) {
    error.value = apiErrorMessage(err);
    loading.value = false;
  } finally {
    preparing.value = false;
  }
}

async function prevPage() {
  if (pdfPage.value <= 1) return;
  pdfPage.value -= 1;
  await renderPdfPage();
}

async function nextPage() {
  if (pdfPage.value >= pdfPages.value) return;
  pdfPage.value += 1;
  await renderPdfPage();
}

async function zoom(delta: number) {
  const next = Math.min(3, Math.max(0.5, Number((pdfScale.value + delta).toFixed(2))));
  if (next === pdfScale.value) return;
  pdfScale.value = next;
  await renderPdfPage();
}

async function epubPrev() {
  if (!rendition) return;
  try {
    await rendition.prev();
  } catch {
    message.info('已经是第一章');
  }
}

async function epubNext() {
  if (!rendition) return;
  try {
    await rendition.next();
  } catch {
    message.info('已经是最后一章');
  }
}

function goBack() {
  if (window.history.length > 1) router.back();
  else void router.push(`/books/${bookId.value}`);
}

onMounted(load);

onBeforeUnmount(() => {
  try {
    rendition?.destroy();
  } catch {
    /* ignore */
  }
  try {
    epubBook?.destroy();
  } catch {
    /* ignore */
  }
  if (pdfDoc) {
    pdfDoc.destroy().catch(() => {});
    pdfDoc = null;
  }
});
</script>

<template>
  <div class="reader-page">
    <header class="reader-bar">
      <button class="reader-back" type="button" aria-label="返回" @click="goBack">
        <ArrowLeftOutlined />
      </button>
      <div class="reader-title-wrap">
        <h1 class="reader-title">{{ book?.title || '在线阅读' }}</h1>
        <span v-if="book" class="reader-format">{{ book.fileFormat.toUpperCase() }}</span>
      </div>

      <div v-if="isPdf && !loading && !error" class="reader-controls">
        <button class="ctrl-btn" type="button" :disabled="pdfPage <= 1 || pdfRendering" data-testid="pdf-prev" @click="prevPage">
          <LeftOutlined />
        </button>
        <span class="page-indicator" data-testid="page-indicator">{{ pdfPage }} / {{ pdfPages }}</span>
        <button
          class="ctrl-btn"
          type="button"
          :disabled="pdfPage >= pdfPages || pdfRendering"
          data-testid="pdf-next"
          @click="nextPage"
        >
          <RightOutlined />
        </button>
        <span class="ctrl-divider"></span>
        <button class="ctrl-btn" type="button" data-testid="pdf-zoom-out" @click="zoom(-0.2)">
          <ZoomOutOutlined />
        </button>
        <span class="zoom-value">{{ Math.round(pdfScale * 100) }}%</span>
        <button class="ctrl-btn" type="button" data-testid="pdf-zoom-in" @click="zoom(0.2)">
          <ZoomInOutlined />
        </button>
      </div>

      <div v-if="isEpub && !loading && !error" class="reader-controls">
        <button class="ctrl-btn" type="button" data-testid="epub-prev" @click="epubPrev">
          <LeftOutlined />
        </button>
        <span class="page-indicator">上一章 / 下一章</span>
        <button class="ctrl-btn" type="button" data-testid="epub-next" @click="epubNext">
          <RightOutlined />
        </button>
      </div>
    </header>

    <main class="reader-main">
      <div v-if="loading" class="reader-loading" data-testid="reader-loading">正在加载文献...</div>

      <div v-else-if="error" class="reader-error">
        <p>{{ error }}</p>
        <a-button type="primary" @click="load">重新加载</a-button>
      </div>

      <div v-if="preparing && !loading && !error" class="preparing-mask" data-testid="reader-preparing">
        正在加载文献...
      </div>

      <div v-if="!loading && !error && isPdf" class="pdf-stage" data-testid="reader-pdf">
        <canvas ref="pdfCanvas" class="pdf-canvas" data-testid="pdf-canvas"></canvas>
        <div v-if="pdfRendering" class="render-mask">渲染中...</div>
      </div>

      <div v-if="!loading && !error && isEpub" class="epub-stage" data-testid="reader-epub">
        <div ref="epubContainer" class="epub-container"></div>
        <p v-if="epubLocation" class="epub-location">{{ epubLocation }}</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.reader-page {
  display: flex;
  height: 100vh;
  flex-direction: column;
  background: #f1ece4;
}

.reader-bar {
  display: flex;
  height: 56px;
  flex: 0 0 56px;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  background: #fff;
  border-bottom: 1px solid var(--rl-border);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}

.reader-back {
  display: flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: #fbf9f5;
  color: var(--rl-text-tertiary);
  cursor: pointer;
}

.reader-back:hover {
  background: #fff1f0;
  color: var(--rl-primary);
}

.reader-title-wrap {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.reader-title {
  overflow: hidden;
  margin: 0;
  color: var(--rl-text);
  font-family: var(--rl-serif);
  font-size: 16px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-format {
  padding: 0 6px;
  border-radius: 3px;
  background: #fff1f0;
  color: var(--rl-primary);
  font-size: 10px;
}

.reader-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.ctrl-btn {
  display: flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--rl-border);
  border-radius: 5px;
  background: #fff;
  color: var(--rl-text-tertiary);
  font-size: 13px;
  cursor: pointer;
}

.ctrl-btn:hover:not(:disabled) {
  border-color: var(--rl-primary);
  color: var(--rl-primary);
}

.ctrl-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-indicator,
.zoom-value {
  min-width: 52px;
  color: var(--rl-text-secondary);
  font-size: 12px;
  text-align: center;
}

.ctrl-divider {
  width: 1px;
  height: 18px;
  margin: 0 6px;
  background: var(--rl-border);
}

.reader-main {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.reader-loading,
.reader-error {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--rl-text-secondary);
}

.preparing-mask {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 5;
  padding: 8px 18px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  transform: translate(-50%, -50%);
}

.reader-error p {
  color: var(--rl-primary);
}

.pdf-stage {
  position: relative;
  display: flex;
  height: 100%;
  align-items: flex-start;
  justify-content: center;
  overflow: auto;
  padding: 24px;
}

.pdf-canvas {
  background: #fff;
  box-shadow: 0 6px 30px rgba(60, 40, 20, 0.18);
}

.render-mask {
  position: absolute;
  top: 50%;
  left: 50%;
  padding: 6px 14px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  transform: translate(-50%, -50%);
}

.epub-stage {
  position: relative;
  height: 100%;
  padding: 20px;
}

.epub-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 6px 30px rgba(60, 40, 20, 0.14);
}

.epub-location {
  position: absolute;
  right: 30px;
  bottom: 28px;
  max-width: 50%;
  padding: 2px 8px;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.85);
  color: var(--rl-text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 767px) {
  .reader-title {
    max-width: 34vw;
    font-size: 14px;
  }

  .pdf-stage {
    padding: 10px;
  }

  .epub-stage {
    padding: 10px;
  }

  .ctrl-divider,
  .zoom-value {
    display: none;
  }
}
</style>
