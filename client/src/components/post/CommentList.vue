<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { SendOutlined } from '@ant-design/icons-vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { apiCreateComment, apiGetComments } from '@/api/posts';
import { apiErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import type { Comment } from '@/types';
import { countChars } from '@/utils/validate';
import { timeAgo } from '@/utils/format';

const props = defineProps<{ postId: number }>();
const emit = defineEmits<{ (event: 'count-change', count: number): void }>();

const auth = useAuthStore();
const list = ref<Comment[]>([]);
const loading = ref(true);
const submitting = ref(false);
const draft = ref('');
const error = ref('');

async function load() {
  loading.value = true;
  try {
    list.value = await apiGetComments(props.postId);
    emit('count-change', list.value.length);
  } catch (err) {
    message.error(apiErrorMessage(err));
  } finally {
    loading.value = false;
  }
}

async function submit() {
  const content = draft.value.trim();
  if (!content) return;
  if (countChars(content) > 500) {
    error.value = '评论不能超过 500 字';
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    const result = await apiCreateComment(props.postId, content);
    list.value.push(result.comment);
    draft.value = '';
    emit('count-change', result.commentCount);
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="comment-area" data-testid="comment-area">
    <h4 class="comment-title">💬 评论 {{ list.length }} 条</h4>

    <div v-if="loading" class="comment-loading">评论加载中...</div>
    <div v-else-if="!list.length" class="comment-empty">还没有评论，来说两句吧</div>
    <ul v-else class="comment-list">
      <li v-for="item in list" :key="item.id" class="comment-item">
        <UserAvatar :user="item.user" :size="28" />
        <div class="comment-main">
          <div class="comment-head">
            <span class="comment-name">{{ item.user.nickname }}</span>
            <span class="comment-time">{{ timeAgo(item.createdAt) }}</span>
          </div>
          <p class="comment-content">{{ item.content }}</p>
        </div>
      </li>
    </ul>

    <form class="comment-form" @submit.prevent="submit">
      <UserAvatar :user="auth.user" :size="28" />
      <div class="comment-input-wrap">
        <a-textarea
          v-model:value="draft"
          :maxlength="500"
          :auto-size="{ minRows: 1, maxRows: 4 }"
          placeholder="写评论..."
          data-testid="comment-input"
          @press-enter.exact.prevent="submit"
        />
        <span v-if="error" class="comment-error">{{ error }}</span>
      </div>
      <button
        class="comment-submit"
        type="submit"
        :disabled="!draft.trim() || submitting"
        data-testid="comment-submit"
      >
        <SendOutlined />
      </button>
    </form>
  </section>
</template>

<style scoped>
.comment-area {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--rl-border-light);
}

.comment-title {
  margin: 0 0 8px;
  color: var(--rl-text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.comment-loading,
.comment-empty {
  padding: 8px 0;
  color: var(--rl-text-secondary);
  font-size: 13px;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}

.comment-item {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  background: #fbf9f5;
}

.comment-main {
  min-width: 0;
  flex: 1;
}

.comment-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.comment-name {
  color: var(--rl-text);
  font-size: 13px;
  font-weight: 600;
}

.comment-time {
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.comment-content {
  margin: 2px 0 0;
  color: var(--rl-text);
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.comment-form {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.comment-input-wrap {
  flex: 1;
}

.comment-input-wrap :deep(.ant-input) {
  border-color: var(--rl-border);
  background: #fbf9f5;
  font-size: 13px;
}

.comment-error {
  color: var(--rl-primary);
  font-size: 12px;
}

.comment-submit {
  display: flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: var(--rl-primary);
  color: #fff;
  cursor: pointer;
}

.comment-submit:disabled {
  background: #e6dccd;
  cursor: not-allowed;
}
</style>
