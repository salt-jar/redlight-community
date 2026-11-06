<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { io, type Socket } from 'socket.io-client';
import { message } from 'ant-design-vue';
import { PictureOutlined, SendOutlined } from '@ant-design/icons-vue';
import AppShell from '@/components/layout/AppShell.vue';
import ChatMessage from '@/components/chat/ChatMessage.vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { apiChatHistory, apiOnline } from '@/api/chat';
import { apiUploadImage } from '@/api/upload';
import { apiErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import type { ChatMessage as ChatMessageType, OnlineSnapshot, PostAuthor } from '@/types';

const auth = useAuthStore();
const router = useRouter();

const messages = ref<ChatMessageType[]>([]);
const onlineUsers = ref<PostAuthor[]>([]);
const draft = ref('');
const loading = ref(true);
const loadingEarlier = ref(false);
const hasMore = ref(false);
const connected = ref(false);
const uploading = ref(false);
const messagesEl = ref<HTMLElement | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);
let socket: Socket | null = null;

const onlineCount = computed(() => onlineUsers.value.length);
const visibleOnline = computed(() => onlineUsers.value.slice(0, 6));

function scrollToBottom() {
  const el = messagesEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

function isNearBottom() {
  const el = messagesEl.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 180;
}

async function loadInitial() {
  loading.value = true;
  try {
    const result = await apiChatHistory(undefined, 50);
    messages.value = result.list;
    hasMore.value = result.hasMore;
    const online = await apiOnline().catch(() => null);
    if (online) onlineUsers.value = online.users;
    await nextTick();
    scrollToBottom();
  } catch (err) {
    message.error(apiErrorMessage(err));
  } finally {
    loading.value = false;
  }
}

async function loadEarlier() {
  if (loadingEarlier.value || !hasMore.value || !messages.value.length) return;
  const el = messagesEl.value;
  const oldHeight = el?.scrollHeight || 0;
  const oldTop = el?.scrollTop || 0;
  loadingEarlier.value = true;
  try {
    const result = await apiChatHistory(messages.value[0].id, 50);
    messages.value = [...result.list, ...messages.value];
    hasMore.value = result.hasMore;
    await nextTick();
    if (el) el.scrollTop = el.scrollHeight - oldHeight + oldTop;
  } catch (err) {
    message.error(apiErrorMessage(err));
  } finally {
    loadingEarlier.value = false;
  }
}

function onMessagesScroll() {
  if ((messagesEl.value?.scrollTop || 0) < 60) void loadEarlier();
}

function connect() {
  socket = io({
    auth: { token: auth.token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    connected.value = true;
  });
  socket.on('disconnect', () => {
    connected.value = false;
  });
  socket.on('chat:message', (payload: ChatMessageType) => {
    const nearBottom = isNearBottom();
    if (!messages.value.some((item) => item.id === payload.id)) {
      messages.value.push(payload);
      if (nearBottom) void nextTick(scrollToBottom);
    }
  });
  socket.on('chat:online', (snapshot: OnlineSnapshot) => {
    onlineUsers.value = snapshot.users || [];
  });
  socket.on('chat:error', (payload: { msg?: string }) => {
    message.error(payload?.msg || '消息发送失败');
  });
  socket.on('connect_error', (error: Error) => {
    connected.value = false;
    message.error(`聊天室连接失败：${error.message}`);
  });
}

function emitMessage(payload: { type: 1 | 2; content: string }) {
  if (!socket?.connected) {
    message.warning('聊天室正在连接，请稍后再试');
    return false;
  }
  socket.emit('chat:send', payload, (ack?: { ok: boolean; msg?: string }) => {
    if (!ack?.ok) message.error(ack?.msg || '消息发送失败');
  });
  return true;
}

function sendText() {
  const content = draft.value.trim();
  if (!content) return;
  if (emitMessage({ type: 1, content })) {
    draft.value = '';
  }
}

function onPressEnter(event: KeyboardEvent) {
  if (event.shiftKey) return;
  event.preventDefault();
  sendText();
}

function triggerImage() {
  imageInput.value?.click();
}

async function onImageChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    message.error('请选择图片文件');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    message.error('图片不能超过 5MB');
    return;
  }
  uploading.value = true;
  try {
    const result = await apiUploadImage(file);
    emitMessage({ type: 2, content: result.url });
  } catch (err) {
    message.error(apiErrorMessage(err));
  } finally {
    uploading.value = false;
  }
}

function goProfile(user: PostAuthor) {
  void router.push(`/profile/${user.id}`);
}

onMounted(async () => {
  await loadInitial();
  connect();
});

onBeforeUnmount(() => {
  socket?.disconnect();
  socket = null;
});
</script>

<template>
  <AppShell :show-right="false">
    <div class="chat-page">
      <header class="chat-head" data-testid="chat-head">
        <div class="chat-title-wrap">
          <h1 class="chat-title">赤光同志群聊</h1>
          <span class="chat-subtitle">思想交流 · 互相学习 · 共同进步</span>
        </div>

        <div class="online-summary">
          <span class="online-indicator" :class="{ off: !connected }"></span>
          <span class="online-label">
            在线 <strong data-testid="chat-online-count">{{ onlineCount }}</strong> 人
          </span>
          <div class="online-avatars">
            <a-popover placement="bottomRight" trigger="click">
              <template #content>
                <div class="online-popover">
                  <p class="popover-title">在线同志（{{ onlineCount }}）</p>
                  <button
                    v-for="user in onlineUsers"
                    :key="user.id"
                    class="popover-user"
                    type="button"
                    @click="goProfile(user)"
                  >
                    <UserAvatar :user="user" :size="26" />
                    <span>{{ user.nickname }}</span>
                  </button>
                  <p v-if="!onlineUsers.length" class="popover-empty">暂无同志在线</p>
                </div>
              </template>
              <button class="avatars-btn" type="button" aria-label="查看在线同志">
                <span v-for="user in visibleOnline" :key="user.id" class="mini-avatar">
                  <UserAvatar :user="user" :size="26" />
                </span>
                <span v-if="onlineCount > visibleOnline.length" class="more-online">+{{ onlineCount - visibleOnline.length }}</span>
              </button>
            </a-popover>
          </div>
        </div>
      </header>

      <section class="chat-body card">
        <div ref="messagesEl" class="message-area" data-testid="chat-messages" @scroll.passive="onMessagesScroll">
          <div v-if="loading" class="chat-placeholder">正在加载聊天记录...</div>
          <template v-else>
            <button v-if="hasMore" class="load-earlier" type="button" :disabled="loadingEarlier" @click="loadEarlier">
              {{ loadingEarlier ? '加载中...' : '上滑加载更早的消息' }}
            </button>
            <div v-else class="chat-start">— 这是赤光社群聊的起点 —</div>

            <p v-if="messages.length === 0" class="chat-placeholder">
              还没有消息，向同志们问声好，开始今天的交流吧。
            </p>

            <ChatMessage
              v-for="item in messages"
              :key="item.id"
              :message="item"
              :self="item.user.id === auth.user?.id"
            />
          </template>
        </div>

        <footer class="chat-composer">
          <div class="composer-tools">
            <input
              ref="imageInput"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              class="chat-file-input"
              data-testid="chat-image-input"
              @change="onImageChange"
            />
            <button class="tool-btn" type="button" :disabled="uploading" title="发送图片" @click="triggerImage">
              <PictureOutlined />
              <span>{{ uploading ? '上传中' : '图片' }}</span>
            </button>
            <span class="conn-state" :class="{ off: !connected }">
              {{ connected ? '已连接' : '连接中...' }}
            </span>
          </div>
          <div class="composer-input-row">
            <a-textarea
              v-model:value="draft"
              :auto-size="{ minRows: 1, maxRows: 4 }"
              :maxlength="1000"
              placeholder="说点什么...（Enter 发送，Shift+Enter 换行）"
              class="chat-input"
              data-testid="chat-input"
              @press-enter="onPressEnter"
            />
            <button class="send-btn" type="button" :disabled="!draft.trim()" data-testid="chat-send" @click="sendText">
              <SendOutlined />
              发送
            </button>
          </div>
        </footer>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.chat-page {
  display: flex;
  height: calc(100vh - 88px);
  flex-direction: column;
  gap: 12px;
}

.chat-head {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--rl-shadow);
}

.chat-title {
  margin: 0;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 1px;
}

.chat-subtitle {
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.online-summary {
  display: flex;
  align-items: center;
  gap: 7px;
}

.online-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--rl-success);
  box-shadow: 0 0 0 3px rgba(82, 163, 80, 0.12);
}

.online-indicator.off {
  background: #c9c0b2;
  box-shadow: none;
}

.online-label {
  color: var(--rl-text-secondary);
  font-size: 12px;
}

.online-label strong {
  color: var(--rl-success);
}

.avatars-btn {
  display: flex;
  align-items: center;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.mini-avatar {
  margin-left: -7px;
  border: 2px solid #fff;
  border-radius: 50%;
}

.mini-avatar:first-child {
  margin-left: 0;
}

.more-online {
  margin-left: 3px;
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.online-popover {
  display: flex;
  max-height: 280px;
  min-width: 170px;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.popover-title {
  margin: 0 0 4px;
  color: var(--rl-text-secondary);
  font-size: 12px;
}

.popover-user {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--rl-text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.popover-user:hover {
  background: #fff1f0;
  color: var(--rl-primary);
}

.popover-empty {
  color: var(--rl-text-secondary);
  font-size: 12px;
}

.chat-body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.message-area {
  flex: 1;
  min-height: 0;
  padding: 18px;
  overflow-y: auto;
  background: #fff;
}

.chat-placeholder {
  padding: 40px 0;
  color: var(--rl-text-secondary);
  font-size: 13px;
  text-align: center;
}

.load-earlier {
  display: block;
  margin: 0 auto 12px;
  padding: 3px 12px;
  border: 1px solid var(--rl-border);
  border-radius: 12px;
  background: #fbf9f5;
  color: var(--rl-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.chat-start {
  margin-bottom: 14px;
  color: #c9bda9;
  font-size: 11px;
  text-align: center;
}

.chat-composer {
  flex: 0 0 auto;
  padding: 10px 14px 12px;
  border-top: 1px solid var(--rl-border-light);
  background: #fdfbf7;
}

.composer-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.chat-file-input {
  display: none;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--rl-primary);
  font-size: 12px;
  cursor: pointer;
}

.tool-btn:hover {
  background: #fff1f0;
}

.conn-state {
  margin-left: auto;
  color: var(--rl-success);
  font-size: 10px;
}

.conn-state.off {
  color: var(--rl-text-secondary);
}

.composer-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.chat-input {
  flex: 1;
}

.chat-input :deep(.ant-input) {
  border-color: var(--rl-border);
  background: #fff;
  font-size: 13px;
}

.send-btn {
  display: inline-flex;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 0 14px;
  border: none;
  border-radius: 6px;
  background: var(--rl-primary);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.send-btn:disabled {
  background: #e6dccd;
  cursor: not-allowed;
}

@media (max-width: 767px) {
  .chat-page {
    height: calc(100vh - 56px - 12px - 80px);
  }

  .chat-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
  }

  .chat-title {
    font-size: 17px;
  }

  .message-area {
    padding: 12px;
  }
}
</style>
