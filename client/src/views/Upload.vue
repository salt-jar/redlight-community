<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { InboxOutlined, UploadOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import AppShell from '@/components/layout/AppShell.vue';
import { apiUploadBook } from '@/api/books';
import { apiErrorMessage } from '@/api/http';
import { formatFileSize } from '@/utils/format';

const router = useRouter();
const categories = ['马恩著作', '列宁著作', '哲学', '政治经济学', '科学社会主义', '党史', '历史', '其他'];
const MAX_SIZE = 100 * 1024 * 1024;

const title = ref('');
const author = ref('');
const category = ref('马恩著作');
const description = ref('');
const file = ref<File | null>(null);
const dragging = ref(false);
const submitting = ref(false);
const progress = ref(0);
const error = ref('');

const fileSize = computed(() => (file.value ? formatFileSize(file.value.size) : ''));
const canSubmit = computed(() => Boolean(title.value.trim()) && Boolean(file.value) && !submitting.value);

function pickFile() {
  document.getElementById('book-file-input')?.click();
}

function acceptFile(next: File | null | undefined) {
  if (!next) return;
  if (!/\.zip$/i.test(next.name)) {
    message.error('请选择 .zip 格式的图书压缩包');
    return;
  }
  if (next.size > MAX_SIZE) {
    message.error('压缩包不能超过 100MB');
    return;
  }
  file.value = next;
  error.value = '';
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  acceptFile(input.files?.[0]);
  input.value = '';
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  acceptFile(event.dataTransfer?.files?.[0]);
}

function clearFile() {
  file.value = null;
  progress.value = 0;
}

async function submit() {
  if (!canSubmit.value || !file.value) return;
  if (!title.value.trim()) {
    error.value = '请填写书名';
    return;
  }
  submitting.value = true;
  progress.value = 0;
  error.value = '';
  try {
    const book = await apiUploadBook(
      {
        title: title.value.trim(),
        author: author.value.trim(),
        category: category.value,
        description: description.value.trim(),
        zipFile: file.value,
      },
      (event) => {
        if (event.total) progress.value = Math.round((event.loaded / event.total) * 100);
      },
    );
    message.success('图书上架成功');
    await router.push(`/books/${book.id}`);
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <AppShell :show-right="false">
    <header class="upload-head">
      <h1 class="page-title">上传图书</h1>
      <p class="page-subtitle">把经典文献整理成 ZIP 压缩包，解压后将自动识别其中的 PDF / EPUB 文件</p>
    </header>

    <div class="upload-grid">
      <section class="upload-form page-card">
        <label class="field">
          <span class="field-label">书名 <em>*</em></span>
          <a-input v-model:value="title" :maxlength="255" placeholder="例如：共产党宣言" data-testid="upload-title" />
        </label>

        <div class="field-row">
          <label class="field">
            <span class="field-label">作者</span>
            <a-input v-model:value="author" :maxlength="128" placeholder="例如：马克思 恩格斯" data-testid="upload-author" />
          </label>
          <label class="field">
            <span class="field-label">分类</span>
            <a-select v-model:value="category" class="full-width" data-testid="upload-category">
              <a-select-option v-for="item in categories" :key="item" :value="item">{{ item }}</a-select-option>
            </a-select>
          </label>
        </div>

        <label class="field">
          <span class="field-label">内容简介</span>
          <a-textarea
            v-model:value="description"
            :rows="4"
            :maxlength="2000"
            placeholder="简要介绍这本书的内容、版本或阅读建议..."
            data-testid="upload-description"
          />
        </label>

        <div
          class="drop-zone"
          :class="{ dragging, filled: Boolean(file) }"
          data-testid="upload-dropzone"
          @click="pickFile"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <input
            id="book-file-input"
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            class="hidden-input"
            data-testid="upload-input"
            @change="onFileChange"
          />
          <template v-if="file">
            <InboxOutlined class="drop-icon filled-icon" />
            <p class="drop-title">{{ file.name }}</p>
            <p class="drop-desc">{{ fileSize }} · 点击重新选择</p>
            <button class="clear-file" type="button" @click.stop="clearFile">移除</button>
          </template>
          <template v-else>
            <InboxOutlined class="drop-icon" />
            <p class="drop-title">点击或拖拽 ZIP 到此处上传</p>
            <p class="drop-desc">单个压缩包不超过 100MB，内含 PDF / EPUB 文件</p>
          </template>
        </div>

        <div v-if="submitting" class="progress-wrap">
          <a-progress :percent="progress" :status="progress >= 100 ? 'success' : 'active'" data-testid="upload-progress" />
        </div>

        <p v-if="error" class="upload-error">{{ error }}</p>

        <a-alert
          class="copyright"
          type="warning"
          show-icon
          message="版权提示"
          description="请上传公有领域或已获授权的马列原著文献；请勿上传受版权保护且未获授权的电子书。"
        />

        <button class="submit-btn" type="button" :disabled="!canSubmit" data-testid="upload-submit" @click="submit">
          <UploadOutlined />
          {{ submitting ? '上传中...' : '上传并上架' }}
        </button>
      </section>

      <aside class="upload-aside">
        <h3 class="section-title">上传说明</h3>
        <ol class="tips">
          <li>将 PDF 或 EPUB 文件（可带文件夹）压缩为 <strong>.zip</strong>。</li>
          <li>系统会递归查找第一个 PDF / EPUB 作为正文，并自动生成封面。</li>
          <li>压缩包内不得包含 <code>.exe</code>、<code>.sh</code> 等可执行文件，也不允许路径穿越条目。</li>
          <li>上传成功后图书立即上架，可在“赤光文献馆”中在线阅读或下载。</li>
        </ol>
        <div class="quote">
          <span class="quote-mark">“</span>
          <p>哲学家们只是用不同的方式解释世界，而问题在于改变世界。</p>
          <span class="quote-from">—— 马克思《关于费尔巴哈的提纲》</span>
        </div>
      </aside>
    </div>
  </AppShell>
</template>

<style scoped>
.upload-head {
  margin: 2px 2px 16px;
}

.upload-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 270px;
  align-items: start;
  gap: 14px;
}

.upload-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: block;
}

.field-label {
  display: block;
  margin-bottom: 5px;
  color: var(--rl-text-tertiary);
  font-size: 13px;
}

.field-label em {
  color: var(--rl-primary);
  font-style: normal;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.full-width {
  width: 100%;
}

.drop-zone {
  display: flex;
  min-height: 160px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 18px;
  border: 1px dashed #d9c8ae;
  border-radius: 8px;
  background: #fdfbf7;
  cursor: pointer;
  transition: all 0.2s ease;
}

.drop-zone:hover,
.drop-zone.dragging {
  border-color: var(--rl-primary);
  background: #fff8f7;
}

.drop-zone.filled {
  border-style: solid;
  border-color: #e7d7bf;
}

.hidden-input {
  display: none;
}

.drop-icon {
  color: #c8a96e;
  font-size: 34px;
}

.filled-icon {
  color: var(--rl-primary);
}

.drop-title {
  margin: 8px 0 0;
  color: var(--rl-text);
  font-size: 14px;
}

.drop-desc {
  margin: 2px 0 0;
  color: var(--rl-text-secondary);
  font-size: 12px;
}

.clear-file {
  margin-top: 8px;
  padding: 2px 10px;
  border: 1px solid var(--rl-border);
  border-radius: 4px;
  background: #fff;
  color: var(--rl-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.progress-wrap {
  padding: 0 2px;
}

.upload-error {
  color: var(--rl-primary);
  font-size: 12px;
}

.copyright {
  border-radius: 6px;
}

.submit-btn {
  display: inline-flex;
  height: 40px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: 6px;
  background: var(--rl-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
}

.submit-btn:hover:not(:disabled) {
  background: var(--rl-primary-hover);
}

.submit-btn:disabled {
  background: #e6dccd;
  cursor: not-allowed;
}

.upload-aside {
  padding: 18px;
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--rl-shadow);
}

.tips {
  margin: 12px 0 18px;
  padding-left: 18px;
  color: var(--rl-text-tertiary);
  font-size: 12px;
  line-height: 1.9;
}

.tips li + li {
  margin-top: 6px;
}

.tips code {
  padding: 1px 4px;
  border-radius: 3px;
  background: #f6f1e9;
  color: var(--rl-deep);
}

.quote {
  position: relative;
  padding: 14px;
  border-radius: 6px;
  background: #fbf7ef;
}

.quote-mark {
  color: var(--rl-gold);
  font-family: Georgia, serif;
  font-size: 30px;
  line-height: 1;
}

.quote p {
  margin: -6px 0 6px;
  color: var(--rl-text-tertiary);
  font-family: var(--rl-serif);
  font-size: 12px;
  line-height: 1.8;
}

.quote-from {
  color: #b3a489;
  font-size: 11px;
}

@media (max-width: 900px) {
  .upload-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 767px) {
  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>
