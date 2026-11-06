<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CloseCircleFilled, CloseOutlined, PictureOutlined, TeamOutlined, NumberOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { apiCreatePost } from '@/api/posts';
import { apiUploadImage } from '@/api/upload';
import { apiSearchUsers } from '@/api/search';
import { apiHotTopics } from '@/api/stats';
import { apiErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import type { Post, User } from '@/types';
import { countChars } from '@/utils/validate';

const emit = defineEmits<{ (event: 'posted', post: Post): void }>();

const auth = useAuthStore();
const ui = useUiStore();

const open = computed({
  get: () => ui.composerOpen,
  set: (value: boolean) => (value ? ui.openComposer() : ui.closeComposer()),
});

const content = ref('');
const images = ref<string[]>([]);
const uploading = ref(0);
const submitting = ref(false);
const error = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const topicsOpen = ref(false);
const mentionOpen = ref(false);
const topics = ref<string[]>(['马列原著', '学习笔记', '读书笔记']);
const mentionUsers = ref<User[]>([]);
const mentionLoading = ref(false);

const charCount = computed(() => countChars(content.value));
const maxChars = 1000;
const maxImages = 9;
const canSubmit = computed(
  () =>
    Boolean(content.value.trim()) &&
    charCount.value <= maxChars &&
    images.value.length <= maxImages &&
    uploading.value === 0 &&
    !submitting.value,
);

async function loadTopics() {
  try {
    const list = await apiHotTopics();
    if (list.length) {
      topics.value = [...new Set([...list.map((item) => item.topic), ...topics.value])].slice(0, 8);
    }
  } catch {
    /* 使用默认话题 */
  }
}

async function loadMentionUsers() {
  mentionLoading.value = true;
  try {
    const result = await apiSearchUsers('', 1, 8);
    mentionUsers.value = result.list;
  } catch {
    mentionUsers.value = [];
  } finally {
    mentionLoading.value = false;
  }
}

watch(open, (value) => {
  if (value) {
    void loadTopics();
    void loadMentionUsers();
  }
});

function triggerImagePicker() {
  if (uploading.value > 0) return;
  fileInput.value?.click();
}

async function onFilesChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  for (const file of files) {
    if (images.value.length >= maxImages) {
      message.warning(`最多上传 ${maxImages} 张图片`);
      break;
    }
    if (!file.type.startsWith('image/')) {
      message.error('仅支持图片文件');
      continue;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('单张图片不能超过 5MB');
      continue;
    }
    uploading.value += 1;
    try {
      const result = await apiUploadImage(file);
      images.value.push(result.url);
    } catch (err) {
      message.error(apiErrorMessage(err));
    } finally {
      uploading.value -= 1;
    }
  }
}

function removeImage(index: number) {
  images.value.splice(index, 1);
}

function insertTopic(topic: string) {
  const token = `#${topic}#`;
  if (!content.value.includes(token)) {
    content.value = `${content.value}${content.value && !content.value.endsWith(' ') ? ' ' : ''}${token} `;
  }
  topicsOpen.value = false;
}

function insertMention(user: User) {
  content.value = `${content.value}${content.value && !content.value.endsWith(' ') ? ' ' : ''}@${user.nickname} `;
  mentionOpen.value = false;
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = '';
  try {
    const post = await apiCreatePost({ content: content.value.trim(), images: [...images.value] });
    emit('posted', post);
    message.success('发布成功');
    content.value = '';
    images.value = [];
    ui.closeComposer();
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    submitting.value = false;
  }
}

function close() {
  if (submitting.value) return;
  ui.closeComposer();
}
</script>

<template>
  <a-modal
    v-model:open="open"
    :closable="false"
    :footer="null"
    :width="640"
    centered
    wrap-class-name="composer-modal"
    @cancel="close"
  >
    <div class="composer">
      <header class="composer-head">
        <h3 class="composer-title">发布动态</h3>
        <button class="close-btn" type="button" aria-label="关闭" @click="close">
          <CloseOutlined />
        </button>
      </header>

      <div class="composer-user">
        <UserAvatar :user="auth.user" :size="38" />
        <div>
          <strong>{{ auth.user?.nickname || '同志' }}</strong>
          <span class="composer-hint">分享你的学习心得...</span>
        </div>
      </div>

      <a-textarea
        v-model:value="content"
        class="composer-textarea"
        :maxlength="maxChars"
        :auto-size="{ minRows: 5, maxRows: 10 }"
        placeholder="今天读到了什么？有什么新的思考？"
        data-testid="composer-textarea"
      />

      <div v-if="images.length || uploading" class="composer-images">
        <div v-for="(src, index) in images" :key="src" class="image-preview">
          <img :src="src" alt="" />
          <button class="remove-image" type="button" aria-label="删除图片" @click="removeImage(index)">
            <CloseCircleFilled />
          </button>
        </div>
        <div v-if="uploading" class="image-preview uploading">上传中...</div>
      </div>

      <div class="composer-toolbar">
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          @change="onFilesChange"
        />
        <button class="tool-btn" type="button" data-testid="composer-image" @click="triggerImagePicker">
          <PictureOutlined />
          <span>图片</span>
        </button>

        <div class="tool-wrap">
          <button class="tool-btn" type="button" @click="topicsOpen = !topicsOpen">
            <NumberOutlined />
            <span>话题</span>
          </button>
          <div v-if="topicsOpen" class="tool-panel topic-panel">
            <button v-for="topic in topics" :key="topic" class="panel-item" type="button" @click="insertTopic(topic)">
              #{{ topic }}#
            </button>
          </div>
        </div>

        <div class="tool-wrap">
          <button class="tool-btn" type="button" @click="mentionOpen = !mentionOpen">
            <TeamOutlined />
            <span>@同志</span>
          </button>
          <div v-if="mentionOpen" class="tool-panel mention-panel">
            <div v-if="mentionLoading" class="panel-empty">加载中...</div>
            <template v-else-if="mentionUsers.length">
              <button
                v-for="user in mentionUsers"
                :key="user.id"
                class="panel-item mention-item"
                type="button"
                @click="insertMention(user)"
              >
                <UserAvatar :user="user" :size="24" />
                <span>{{ user.nickname }}</span>
              </button>
            </template>
            <div v-else class="panel-empty">还没有可 @ 的同志</div>
          </div>
        </div>

        <div class="composer-counter" :class="{ over: charCount > maxChars }">
          {{ charCount }}/{{ maxChars }}
        </div>
      </div>

      <p v-if="error" class="composer-error">{{ error }}</p>
      <p class="composer-tip">请遵守社区规范，理性交流；转载文献请注明来源。</p>

      <footer class="composer-foot">
        <button class="cancel-btn" type="button" @click="close">取消</button>
        <button
          class="publish-btn"
          type="button"
          :disabled="!canSubmit"
          data-testid="composer-submit"
          @click="submit"
        >
          {{ submitting ? '发布中...' : '发布' }}
        </button>
      </footer>
    </div>
  </a-modal>
</template>

<style scoped>
.composer {
  padding: 18px 22px 20px;
}

.composer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--rl-border-light);
}

.composer-title {
  margin: 0;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 1px;
}

.close-btn {
  display: flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--rl-text-secondary);
  font-size: 17px;
  cursor: pointer;
}

.close-btn:hover {
  background: #fff1f0;
  color: var(--rl-primary);
}

.composer-user {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0 8px;
}

.composer-user strong {
  display: block;
  color: var(--rl-text);
  font-size: 14px;
}

.composer-hint {
  color: var(--rl-text-secondary);
  font-size: 12px;
}

.composer-textarea {
  padding: 10px 0;
}

.composer-textarea :deep(.ant-input) {
  min-height: 130px;
  border: none;
  box-shadow: none;
  padding: 4px 0;
  color: var(--rl-text);
  font-size: 15px;
  line-height: 1.8;
  resize: none;
}

.composer-images {
  display: grid;
  grid-template-columns: repeat(3, 96px);
  gap: 8px;
  margin: 8px 0;
}

.image-preview {
  position: relative;
  overflow: hidden;
  width: 96px;
  height: 96px;
  border-radius: 6px;
  background: #f6f1e9;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-preview.uploading {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--rl-text-secondary);
  font-size: 12px;
}

.remove-image {
  position: absolute;
  top: 3px;
  right: 3px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.composer-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--rl-border-light);
}

.file-input {
  display: none;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--rl-primary);
  font-size: 13px;
  cursor: pointer;
}

.tool-btn:hover {
  background: #fff1f0;
}

.tool-wrap {
  position: relative;
}

.tool-panel {
  position: absolute;
  bottom: 36px;
  left: 0;
  z-index: 20;
  width: 190px;
  max-height: 240px;
  padding: 6px;
  overflow-y: auto;
  border: 1px solid var(--rl-border);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(80, 40, 20, 0.14);
}

.topic-panel {
  width: 170px;
}

.mention-panel {
  width: 200px;
}

.panel-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--rl-text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.panel-item:hover {
  background: #fff1f0;
  color: var(--rl-primary);
}

.panel-empty {
  padding: 10px;
  color: var(--rl-text-secondary);
  font-size: 12px;
  text-align: center;
}

.composer-counter {
  margin-left: auto;
  color: var(--rl-text-secondary);
  font-size: 12px;
}

.composer-counter.over {
  color: var(--rl-primary);
}

.composer-error {
  margin-top: 8px;
  color: var(--rl-primary);
  font-size: 12px;
}

.composer-tip {
  margin-top: 6px;
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.composer-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.cancel-btn,
.publish-btn {
  height: 36px;
  padding: 0 24px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.cancel-btn {
  border: 1px solid var(--rl-border);
  background: #fff;
  color: var(--rl-text-tertiary);
}

.publish-btn {
  border: 1px solid var(--rl-primary);
  background: var(--rl-primary);
  color: #fff;
  font-weight: 600;
  letter-spacing: 2px;
}

.publish-btn:hover:not(:disabled) {
  background: var(--rl-primary-hover);
}

.publish-btn:disabled {
  border-color: #e6dccd;
  background: #e6dccd;
  color: #fff;
  cursor: not-allowed;
}

@media (max-width: 767px) {
  .composer {
    padding: 14px 16px 18px;
  }

  .composer-images {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .image-preview {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
  }

  .tool-btn span {
    display: none;
  }
}
</style>
