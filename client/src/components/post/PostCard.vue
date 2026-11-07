<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  EllipsisOutlined,
  HeartFilled,
  HeartOutlined,
  MessageOutlined,
  RetweetOutlined,
} from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import PostImageGrid from './PostImageGrid.vue';
import CommentList from './CommentList.vue';
import ReportDialog from '@/components/common/ReportDialog.vue';
import { apiLikePost, apiRepost } from '@/api/posts';
import { apiModeratePost } from '@/api/moderation';
import { apiErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import type { Post } from '@/types';
import { formatCount, timeAgo } from '@/utils/format';
import { renderRichText } from '@/utils/richText';
import { countChars } from '@/utils/validate';

const props = defineProps<{ post: Post }>();
const emit = defineEmits<{ (event: 'reposted', post: Post): void }>();

const router = useRouter();
const auth = useAuthStore();
const isAdmin = computed(() => Number(auth.user?.role) === 1);
const liked = ref(props.post.liked);
const likeCount = ref(props.post.likeCount);
const commentCount = ref(props.post.commentCount);
const likePending = ref(false);
const commentsOpen = ref(false);
const repostOpen = ref(false);
const reportOpen = ref(false);
const repostText = ref('');
const reposting = ref(false);
const repostError = ref('');

const htmlContent = computed(() => renderRichText(props.post.content));
const repostHtml = computed(() => (props.post.repost ? renderRichText(props.post.repost.content) : ''));
const overLimit = computed(() => countChars(repostText.value) > 1000);

async function toggleLike() {
  if (likePending.value) return;
  likePending.value = true;
  const next = !liked.value;
  liked.value = next;
  likeCount.value = Math.max(0, likeCount.value + (next ? 1 : -1));
  try {
    const result = await apiLikePost(props.post.id);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch (error) {
    liked.value = !next;
    likeCount.value = Math.max(0, likeCount.value + (next ? -1 : 1));
    message.error(apiErrorMessage(error));
  } finally {
    likePending.value = false;
  }
}

function toggleComments() {
  commentsOpen.value = !commentsOpen.value;
}

function onCommentCount(count: number) {
  commentCount.value = count;
}

async function submitRepost() {
  if (overLimit.value) {
    repostError.value = '转发评论不能超过 1000 字';
    return;
  }
  reposting.value = true;
  repostError.value = '';
  try {
    const created = await apiRepost(props.post.id, repostText.value.trim());
    message.success('转发成功');
    repostOpen.value = false;
    repostText.value = '';
    emit('reposted', created);
  } catch (error) {
    repostError.value = apiErrorMessage(error);
  } finally {
    reposting.value = false;
  }
}

function onMoreClick(info: { key: string | number }) {
  const key = String(info.key);
  if (key === 'report') reportOpen.value = true;
  else if (key === 'uninterested') message.info('将减少展示此类内容');
  else if (key === 'favorite') message.info('已收藏（演示功能）');
  else if (key === 'admin_remove_post') {
    Modal.confirm({
      title: '管理员下架文章',
      content: '确认直接下架这篇文章？普通用户将无法再看到。',
      okText: '确认下架',
      okType: 'danger',
      cancelText: '取消',
      async onOk() {
        try {
          await apiModeratePost(props.post.id, 0);
          message.success('文章已下架');
          window.location.reload();
        } catch (error) {
          message.error(apiErrorMessage(error));
        }
      },
    });
  }
}

function goProfile(userId: number) {
  void router.push(`/profile/${userId}`);
}
</script>

<template>
  <article class="post-card" data-testid="post-card" :data-post-id="post.id">
    <header class="post-head">
      <button class="author-avatar" type="button" @click="goProfile(post.user.id)">
        <UserAvatar :user="post.user" :size="40" />
      </button>
      <div class="author-info">
        <button class="author-name" type="button" @click="goProfile(post.user.id)">{{ post.user.nickname }}</button>
        <p class="author-bio">{{ post.user.bio || '赤光社同志' }}</p>
      </div>
      <time class="post-time" :datetime="post.createdAt" :title="post.createdAt">{{ timeAgo(post.createdAt) }}</time>
    </header>

    <div class="post-body">
      <p v-if="post.content" class="post-content" v-html="htmlContent"></p>

      <blockquote v-if="post.repost" class="repost-quote">
        <button class="quote-author" type="button" @click="goProfile(post.repost.user.id)">
          @{{ post.repost.user.nickname }}
        </button>
        <p v-if="post.repost.content" class="quote-content" v-html="repostHtml"></p>
        <p v-else class="quote-content quote-empty">[原帖无正文]</p>
        <span class="quote-meta">
          {{ timeAgo(post.repost.createdAt) }}
          <template v-if="post.repost.images.length"> · {{ post.repost.images.length }} 张配图</template>
        </span>
      </blockquote>

      <PostImageGrid v-if="post.images.length" :images="post.images" />
    </div>

    <footer class="post-actions">
      <button
        class="action-btn like-btn"
        :class="{ active: liked }"
        type="button"
        data-testid="like-button"
        @click="toggleLike"
      >
        <HeartFilled v-if="liked" />
        <HeartOutlined v-else />
        <span>{{ likeCount > 0 ? formatCount(likeCount) : '点赞' }}</span>
      </button>

      <button
        class="action-btn"
        :class="{ active: commentsOpen }"
        type="button"
        data-testid="comment-button"
        @click="toggleComments"
      >
        <MessageOutlined />
        <span>{{ commentCount > 0 ? formatCount(commentCount) : '评论' }}</span>
      </button>

      <button class="action-btn" type="button" data-testid="repost-button" @click="repostOpen = true">
        <RetweetOutlined />
        <span>转发</span>
      </button>

      <a-dropdown placement="bottomRight" :trigger="['click']">
        <button class="action-btn more-btn" type="button" aria-label="更多">
          <EllipsisOutlined />
        </button>
        <template #overlay>
          <a-menu @click="onMoreClick">
            <a-menu-item key="report">举报</a-menu-item>
            <a-menu-item v-if="isAdmin" key="admin_remove_post" danger>管理员下架文章</a-menu-item>
            <a-menu-item key="uninterested">不感兴趣</a-menu-item>
            <a-menu-item key="favorite">收藏</a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </footer>

    <CommentList
      v-if="commentsOpen"
      :post-id="post.id"
      @count-change="onCommentCount"
    />

    <a-modal
      v-model:open="repostOpen"
      title="转发动态"
      ok-text="转发"
      cancel-text="取消"
      :confirm-loading="reposting"
      :ok-button-props="{ disabled: overLimit }"
      @ok="submitRepost"
    >
      <p class="repost-tip">转发时可以附上你的评论：</p>
      <a-textarea
        v-model:value="repostText"
        :rows="4"
        :maxlength="1000"
        placeholder="说说你的看法..."
        data-testid="repost-textarea"
      />
      <div class="repost-counter" :class="{ over: overLimit }">{{ repostText.length }} / 1000</div>
      <p v-if="repostError" class="repost-error">{{ repostError }}</p>

      <div v-if="post.repost" class="repost-preview">
        <span class="preview-author">@{{ post.repost.user.nickname }}</span>
        <p class="preview-content">{{ post.repost.content }}</p>
      </div>
      <div v-else class="repost-preview">
        <span class="preview-author">@{{ post.user.nickname }}</span>
        <p class="preview-content">{{ post.content }}</p>
      </div>
    </a-modal>

    <ReportDialog
      v-model:open="reportOpen"
      target-type="post"
      :target-id="post.id"
      :target-title="post.content.slice(0, 50) || `动态 #${post.id}`"
    />
  </article>
</template>

<style scoped>
.post-card {
  margin-bottom: 12px;
  padding: 16px;
  background: #fff;
  border-radius: var(--rl-radius-card);
  box-shadow: var(--rl-shadow);
  transition: box-shadow 0.2s ease;
}

.post-card:hover {
  box-shadow: 0 4px 14px rgba(80, 40, 20, 0.08);
}

.post-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.author-avatar {
  flex: 0 0 auto;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

.author-info {
  min-width: 0;
  flex: 1;
}

.author-name {
  padding: 0;
  border: none;
  background: none;
  color: var(--rl-text);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
  cursor: pointer;
}

.author-name:hover {
  color: var(--rl-deep);
}

.author-bio {
  overflow: hidden;
  margin: 0;
  color: var(--rl-text-secondary);
  font-size: 12px;
  line-height: 1.6;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.post-time {
  flex: 0 0 auto;
  padding-top: 2px;
  color: var(--rl-text-secondary);
  font-size: 13px;
}

.post-body {
  padding: 10px 0 4px 50px;
}

.post-content {
  margin: 0;
  color: var(--rl-text);
  font-size: 15px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.post-content :deep(.topic-link) {
  color: var(--rl-primary);
  font-weight: 600;
}

.repost-quote {
  margin: 10px 0 0;
  padding: 10px 12px;
  border-left: 3px solid var(--rl-gold);
  border-radius: 0 6px 6px 0;
  background: #fbf7ef;
}

.quote-author {
  padding: 0;
  border: none;
  background: none;
  color: var(--rl-deep);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.quote-content {
  display: -webkit-box;
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--rl-text-tertiary);
  font-size: 13px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.quote-empty {
  color: var(--rl-text-secondary);
}

.quote-meta {
  display: block;
  margin-top: 4px;
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.post-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 50px;
  padding-top: 8px;
  border-top: 1px solid var(--rl-border-light);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--rl-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: #fff1f0;
  color: var(--rl-primary);
}

.action-btn.active {
  color: var(--rl-primary);
}

.like-btn.active {
  color: var(--rl-primary);
}

.more-btn {
  margin-left: auto;
  padding: 5px 8px;
}

.repost-tip {
  margin-bottom: 8px;
  color: var(--rl-text-secondary);
  font-size: 13px;
}

.repost-counter {
  margin-top: 4px;
  color: var(--rl-text-secondary);
  font-size: 12px;
  text-align: right;
}

.repost-counter.over {
  color: var(--rl-primary);
}

.repost-error {
  margin-top: 4px;
  color: var(--rl-primary);
  font-size: 12px;
}

.repost-preview {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #fbf9f5;
}

.preview-author {
  color: var(--rl-deep);
  font-size: 13px;
  font-weight: 600;
}

.preview-content {
  display: -webkit-box;
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--rl-text-tertiary);
  font-size: 13px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

@media (max-width: 767px) {
  .post-body {
    padding-left: 0;
  }

  .post-actions {
    margin-left: 0;
  }
}
</style>
