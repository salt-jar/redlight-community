<script setup lang="ts">
import { ref } from 'vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import type { ChatMessage } from '@/types';
import { formatChatTime } from '@/utils/format';

const props = defineProps<{ message: ChatMessage; self: boolean }>();

const emit = defineEmits<{ (event: 'open-proposal', proposalId: number): void }>();

const previewOpen = ref(false);
const previewSrc = ref('');

function openProposalFromMessage() {
  if (props.message.proposalId) emit('open-proposal', props.message.proposalId);
}

function onContextMenu(event: MouseEvent) {
  if (!props.message.proposalId) return;
  event.preventDefault();
  emit('open-proposal', props.message.proposalId);
}

function openPreview(src: string) {
  previewSrc.value = src;
  previewOpen.value = true;
}
</script>

<template>
  <div
    class="chat-msg"
    :class="{ self, 'proposal-msg': message.proposalId }"
    :data-message-id="message.id"
    @contextmenu="onContextMenu"
  >
    <UserAvatar v-if="!self" :user="message.user" :size="34" class="msg-avatar" />
    <div class="msg-body">
      <div class="msg-meta">
        <span class="msg-name">{{ message.user.nickname }}</span>
        <span v-if="message.user.isAdmin" class="admin-badge" data-testid="admin-badge">管理员</span>
        <span v-if="message.proposalId" class="proposal-chat-badge">提案讨论</span>
        <span class="msg-time">{{ formatChatTime(message.createdAt) }}</span>
      </div>
      <p v-if="message.proposalId" class="proposal-chat-title" @click="openProposalFromMessage" @contextmenu.prevent="openProposalFromMessage">
        {{ message.proposalTitle || '提案' }} · 右键打开提案
      </p>
      <div v-if="message.type === 2" class="msg-bubble image-bubble">
        <img :src="message.content" alt="图片消息" @click="openPreview(message.content)" />
      </div>
      <div v-else class="msg-bubble text-bubble">{{ message.content }}</div>
    </div>
    <UserAvatar v-if="self" :user="message.user" :size="34" class="msg-avatar" />

    <a-modal v-model:open="previewOpen" :footer="null" :width="760" centered>
      <img :src="previewSrc" alt="图片预览" class="preview-image" />
    </a-modal>
  </div>
</template>

<style scoped>
.chat-msg {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 14px;
}

.chat-msg.self {
  justify-content: flex-end;
}

.msg-avatar {
  margin-top: 2px;
}

.msg-body {
  max-width: 72%;
}

.chat-msg.self .msg-body {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.msg-meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 2px;
  color: var(--rl-text-secondary);
  font-size: 10px;
}

.msg-name {
  font-size: 11px;
}

.admin-badge {
  padding: 0 5px;
  border: 1px solid #91caff;
  border-radius: 3px;
  background: #e6f4ff;
  color: #1677ff;
  font-size: 9px;
  font-weight: 600;
  line-height: 14px;
}

.proposal-chat-badge {
  padding: 0 5px;
  border: 1px solid #e5cda6;
  border-radius: 3px;
  background: #fdf8ee;
  color: #946b2d;
  font-size: 9px;
  line-height: 14px;
}

.proposal-chat-title {
  margin: 0 0 3px;
  color: #946b2d;
  font-size: 10px;
  cursor: context-menu;
}

.chat-msg.proposal-msg .text-bubble {
  border: 1px solid #ead7b5;
  background: #fffaf0;
  color: var(--rl-text);
}

.msg-bubble {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.text-bubble {
  background: #f6f1e9;
  color: var(--rl-text);
}

.self .text-bubble {
  background: #c8102e;
  color: #fff;
}

.self .msg-meta {
  flex-direction: row-reverse;
}

.image-bubble {
  padding: 4px;
  background: #f6f1e9;
}

.image-bubble img {
  max-width: 240px;
  max-height: 240px;
  border-radius: 4px;
  cursor: zoom-in;
  object-fit: cover;
}

.preview-image {
  max-height: 76vh;
  margin: 0 auto;
  object-fit: contain;
}
</style>
