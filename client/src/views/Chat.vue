<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { message } from 'ant-design-vue';
import {
  ClockCircleOutlined,
  FileTextOutlined,
  MessageOutlined,
  PictureOutlined,
  PlusOutlined,
  SendOutlined,
} from '@ant-design/icons-vue';
import AppShell from '@/components/layout/AppShell.vue';
import ChatMessage from '@/components/chat/ChatMessage.vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { apiChatGroups, apiChatHistory, apiOnline } from '@/api/chat';
import { apiCreateProposal, apiProposals } from '@/api/proposals';
import { apiUploadImage } from '@/api/upload';
import { apiErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import type { ChatGroup, ChatMessage as ChatMessageType, OnlineSnapshot, PostAuthor, Proposal } from '@/types';

const GROUP_STORAGE_KEY = 'redlight_chat_group';
const auth = useAuthStore();

const messages = ref<ChatMessageType[]>([]);
const onlineUsers = ref<PostAuthor[]>([]);
const groups = ref<ChatGroup[]>([]);
const activeGroupId = ref(1);
const activeFunction = ref<'proposals'>('proposals');
const draft = ref('');
const loading = ref(true);
const loadingEarlier = ref(false);
const hasMore = ref(false);
const connected = ref(false);
const uploading = ref(false);
const messagesEl = ref<HTMLElement | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);
let socket: Socket | null = null;
let historyRequest = 0;

const proposals = ref<Proposal[]>([]);
const selectedProposal = ref<Proposal | null>(null);
const proposalFormOpen = ref(false);
const proposalSubmitting = ref(false);
const proposalError = ref('');
const proposalForm = ref({
  title: '',
  proposalTime: '',
  proposerInfo: '',
  content: '',
});

const onlineCount = computed(() => onlineUsers.value.length);
const visibleOnline = computed(() => onlineUsers.value.slice(0, 5));
const activeGroup = computed(() => groups.value.find((group) => group.id === activeGroupId.value) || null);

function scrollToBottom() {
  const el = messagesEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

function isNearBottom() {
  const el = messagesEl.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 180;
}

async function loadGroups() {
  try {
    groups.value = await apiChatGroups();
    if (!groups.value.length) {
      message.error('暂无可用群聊');
      return;
    }
    const saved = Number(localStorage.getItem(GROUP_STORAGE_KEY));
    const exists = groups.value.some((group) => group.id === saved);
    activeGroupId.value = exists ? saved : groups.value[0].id;
  } catch (err) {
    message.error(apiErrorMessage(err));
  }
}

async function loadHistory() {
  const requestId = ++historyRequest;
  const groupId = activeGroupId.value;
  loading.value = true;
  try {
    const result = await apiChatHistory(undefined, 50, groupId);
    if (requestId !== historyRequest || groupId !== activeGroupId.value) return;
    messages.value = result.list;
    hasMore.value = result.hasMore;
    await nextTick();
    scrollToBottom();
  } catch (err) {
    if (requestId === historyRequest) message.error(apiErrorMessage(err));
  } finally {
    if (requestId === historyRequest) loading.value = false;
  }
}

async function loadEarlier() {
  if (loadingEarlier.value || !hasMore.value || !messages.value.length) return;
  const el = messagesEl.value;
  const oldHeight = el?.scrollHeight || 0;
  const oldTop = el?.scrollTop || 0;
  const groupId = activeGroupId.value;
  loadingEarlier.value = true;
  try {
    const result = await apiChatHistory(messages.value[0].id, 50, groupId);
    if (groupId !== activeGroupId.value) return;
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

function joinCurrentGroup() {
  if (!socket?.connected) return;
  socket.emit('chat:join', { groupId: activeGroupId.value }, (ack?: { ok?: boolean; msg?: string }) => {
    if (ack && !ack.ok) message.error(ack.msg || '切换群聊失败');
  });
}

function connect() {
  socket = io({
    auth: { token: auth.token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    connected.value = true;
    joinCurrentGroup();
  });
  socket.on('disconnect', () => {
    connected.value = false;
  });
  socket.on('chat:message', (payload: ChatMessageType) => {
    if (payload.groupId && payload.groupId !== activeGroupId.value) return;
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
    message.error(error?.message || '聊天室连接失败');
  });
}

function emitMessage(payload: { type: 1 | 2; content: string }, onSuccess?: () => void) {
  if (!socket?.connected) {
    message.warning('聊天室正在连接，请稍后再试');
    return false;
  }
  socket.emit(
    'chat:send',
    { ...payload, groupId: activeGroupId.value },
    (ack?: { ok: boolean; msg?: string }) => {
      if (!ack?.ok) {
        message.error(ack?.msg || '消息发送失败');
        return;
      }
      onSuccess?.();
    },
  );
  return true;
}

function sendText() {
  const content = draft.value.trim();
  if (!content) return;
  emitMessage({ type: 1, content }, () => {
    draft.value = '';
  });
}

function onPressEnter(event: KeyboardEvent) {
  if (event.shiftKey) return;
  event.preventDefault();
  sendText();
}

async function onImageChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    const result = await apiUploadImage(file);
    emitMessage({ type: 2, content: result.url });
  } catch (err) {
    message.error(apiErrorMessage(err));
  } finally {
    uploading.value = false;
    input.value = '';
  }
}

function triggerImage() {
  if (uploading.value) return;
  imageInput.value?.click();
}

async function switchGroup(group: ChatGroup) {
  if (group.id === activeGroupId.value) return;
  activeGroupId.value = group.id;
  localStorage.setItem(GROUP_STORAGE_KEY, String(group.id));
  messages.value = [];
  hasMore.value = false;
  joinCurrentGroup();
  await loadHistory();
}

function formatProposalTime(value: string) {
  if (!value) return '—';
  return value.replace('T', ' ');
}

function formatCreatedAt(value: string) {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

async function loadProposals() {
  try {
    proposals.value = await apiProposals(50);
    if (proposals.value.length) {
      selectedProposal.value = proposals.value[0];
      proposalFormOpen.value = false;
    } else {
      selectedProposal.value = null;
      proposalFormOpen.value = true;
      prepareProposalForm();
    }
  } catch (err) {
    message.error(apiErrorMessage(err));
  }
}

function openProposalTab() {
  activeFunction.value = 'proposals';
  if (!selectedProposal.value && proposals.value.length) {
    selectedProposal.value = proposals.value[0];
    proposalFormOpen.value = false;
  }
}

function selectProposal(proposal: Proposal) {
  selectedProposal.value = proposal;
  proposalFormOpen.value = false;
  activeFunction.value = 'proposals';
}

function prepareProposalForm() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const user = auth.user;
  proposalForm.value = {
    title: '',
    proposalTime: local,
    proposerInfo: user
      ? `${user.nickname}${user.username ? ` @${user.username}` : ''}${user.communityNo ? ` · 社区号 ${user.communityNo}` : ''}`
      : '',
    content: '',
  };
}

function startNewProposal() {
  selectedProposal.value = null;
  proposalFormOpen.value = true;
  proposalError.value = '';
  activeFunction.value = 'proposals';
  prepareProposalForm();
}

function cancelProposalForm() {
  proposalFormOpen.value = false;
  proposalError.value = '';
  if (proposals.value.length) selectedProposal.value = proposals.value[0];
}

async function submitProposal() {
  proposalError.value = '';
  if (proposalForm.value.title.trim().length < 2) {
    proposalError.value = '请填写提案标题（至少 2 个字符）';
    return;
  }
  if (!proposalForm.value.proposalTime) {
    proposalError.value = '请填写提案时间';
    return;
  }
  if (proposalForm.value.proposerInfo.trim().length < 2) {
    proposalError.value = '请填写发起人信息';
    return;
  }
  if (proposalForm.value.content.trim().length < 10) {
    proposalError.value = '提案正文至少 10 个字符';
    return;
  }
  proposalSubmitting.value = true;
  try {
    const created = await apiCreateProposal({
      title: proposalForm.value.title.trim(),
      proposalTime: proposalForm.value.proposalTime,
      proposerInfo: proposalForm.value.proposerInfo.trim(),
      content: proposalForm.value.content.trim(),
    });
    message.success('提案已提交');
    proposals.value = await apiProposals(50);
    selectedProposal.value = created;
    proposalFormOpen.value = false;
  } catch (err) {
    proposalError.value = apiErrorMessage(err);
  } finally {
    proposalSubmitting.value = false;
  }
}

onMounted(async () => {
  loading.value = true;
  await loadGroups();
  await loadHistory();
  const online = await apiOnline().catch(() => null);
  if (online) onlineUsers.value = online.users;
  await loadProposals();
  loading.value = false;
  connect();
});

onBeforeUnmount(() => {
  socket?.disconnect();
  socket = null;
});
</script>

<template>
  <AppShell :show-right="false" full-bleed>
    <div class="chat-page">
      <div class="chat-layout">
        <aside class="group-column" data-testid="chat-group-list">
          <header class="group-head">
            <div>
              <span class="group-kicker">群聊</span>
              <h1>赤光社群</h1>
            </div>
            <span class="group-count">{{ groups.length }}</span>
          </header>

          <nav class="group-list">
            <button
              v-for="group in groups"
              :key="group.id"
              class="group-item"
              :class="{ active: group.id === activeGroupId }"
              :data-group-id="group.id"
              type="button"
              @click="switchGroup(group)"
            >
              <span class="group-avatar"><MessageOutlined /></span>
              <span class="group-copy">
                <strong>{{ group.name }}</strong>
                <small>{{ group.description }}</small>
              </span>
            </button>
          </nav>

          <footer class="group-foot">
            <span class="online-dot" :class="{ off: !connected }"></span>
            <span data-testid="chat-online-count">{{ onlineCount }}</span> 人在线
            <a-popover placement="topLeft" trigger="click">
              <template #content>
                <div class="online-popover">
                  <p class="popover-title">在线同志</p>
                  <div v-for="user in onlineUsers" :key="user.id" class="popover-user">
                    <UserAvatar :user="user" :size="22" />
                    <span>{{ user.nickname }}</span>
                  </div>
                  <p v-if="!onlineUsers.length" class="popover-empty">暂无在线同志</p>
                </div>
              </template>
              <button class="online-avatars" type="button" aria-label="查看在线用户">
                <UserAvatar v-for="user in visibleOnline" :key="user.id" :user="user" :size="24" class="mini-avatar" />
              </button>
            </a-popover>
          </footer>
        </aside>

        <section class="chat-column">
          <header class="chat-head">
            <div class="chat-title-wrap">
              <h2 class="chat-title">{{ activeGroup?.name || '群聊' }}</h2>
              <p class="chat-subtitle">{{ activeGroup?.description || '思想交流 · 互相学习 · 共同进步' }}</p>
            </div>
            <div class="chat-status">
              <span class="chat-conn" :class="{ off: !connected }">{{ connected ? '已连接' : '连接中...' }}</span>
              <button class="chat-proposal-shortcut" type="button" @click="openProposalTab">
                <FileTextOutlined /> 提案
              </button>
            </div>
          </header>

          <section class="chat-body">
            <div ref="messagesEl" class="message-area" data-testid="chat-messages" @scroll.passive="onMessagesScroll">
              <div v-if="loading" class="chat-placeholder">正在加载聊天记录...</div>
              <template v-else>
                <button v-if="hasMore" class="load-earlier" type="button" :disabled="loadingEarlier" @click="loadEarlier">
                  {{ loadingEarlier ? '加载中...' : '上滑加载更早的消息' }}
                </button>
                <div v-else class="chat-start">— 这是「{{ activeGroup?.name }}」的起点 —</div>

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
        </section>

        <aside class="function-panel" data-testid="proposal-panel">
          <nav class="function-tabs" aria-label="群聊功能">
            <p class="function-label">功能</p>
            <button
              class="function-tab"
              :class="{ active: activeFunction === 'proposals' }"
              type="button"
              data-testid="proposal-option"
              @click="openProposalTab"
            >
              <FileTextOutlined />
              <span>提案</span>
              <em>{{ proposals.length }}</em>
            </button>
          </nav>

          <div class="function-content">
            <header class="proposal-head">
              <div>
                <span class="proposal-kicker">提案</span>
                <h2>{{ proposalFormOpen ? '发起提案' : selectedProposal ? '提案详情' : '提案' }}</h2>
              </div>
              <button class="proposal-new-btn" type="button" data-testid="proposal-new" @click="startNewProposal">
                <PlusOutlined /> 发起提案
              </button>
            </header>

            <form v-if="proposalFormOpen" class="proposal-form" @submit.prevent="submitProposal">
              <label class="proposal-field">
                <span>提案标题</span>
                <a-input v-model:value="proposalForm.title" :maxlength="120" placeholder="请填写提案标题" data-testid="proposal-title" />
              </label>
              <label class="proposal-field">
                <span>提案时间</span>
                <input v-model="proposalForm.proposalTime" class="proposal-datetime" type="datetime-local" data-testid="proposal-time" />
              </label>
              <label class="proposal-field">
                <span>发起人信息</span>
                <a-input v-model:value="proposalForm.proposerInfo" :maxlength="255" placeholder="姓名 / 用户名 / 社区号" data-testid="proposal-proposer" />
              </label>
              <label class="proposal-field">
                <span>提案正文</span>
                <a-textarea
                  v-model:value="proposalForm.content"
                  :rows="5"
                  :maxlength="5000"
                  show-count
                  placeholder="请说明提案背景、目标与具体建议"
                  data-testid="proposal-content"
                />
              </label>
              <p v-if="proposalError" class="proposal-error">{{ proposalError }}</p>
              <div class="proposal-form-actions">
                <button class="proposal-cancel" type="button" @click="cancelProposalForm">取消</button>
                <button class="proposal-submit" type="submit" :disabled="proposalSubmitting" data-testid="proposal-submit">
                  {{ proposalSubmitting ? '提交中...' : '提交提案' }}
                </button>
              </div>
            </form>

            <div v-else-if="selectedProposal" class="proposal-detail" data-testid="proposal-detail">
              <h3>{{ selectedProposal.title }}</h3>
              <div class="proposal-meta">
                <span><ClockCircleOutlined /> {{ formatProposalTime(selectedProposal.proposalTime) }}</span>
                <span>发起人：{{ selectedProposal.proposerInfo }}</span>
                <span>记录于 {{ formatCreatedAt(selectedProposal.createdAt) }}</span>
              </div>
              <div class="proposal-content">{{ selectedProposal.content }}</div>
            </div>

            <div v-else class="proposal-empty">
              <FileTextOutlined />
              <p>暂无提案</p>
            </div>

            <section class="proposal-list-section">
              <div class="proposal-list-head">
                <h4>提案列表</h4>
                <span>{{ proposals.length }} 条</span>
              </div>
              <div v-if="proposals.length" class="proposal-list">
                <button
                  v-for="proposal in proposals"
                  :key="proposal.id"
                  class="proposal-item"
                  :class="{ active: selectedProposal?.id === proposal.id && !proposalFormOpen }"
                  type="button"
                  data-testid="proposal-mini"
                  @click="selectProposal(proposal)"
                >
                  <strong>{{ proposal.title }}</strong>
                  <span>{{ proposal.proposerInfo }}</span>
                  <span>{{ formatProposalTime(proposal.proposalTime) }} · {{ formatCreatedAt(proposal.createdAt) }}</span>
                </button>
              </div>
              <p v-else class="proposal-list-empty">暂无提案，提交第一条后会显示在这里。</p>
            </section>
          </div>
        </aside>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.chat-page {
  width: 100%;
  height: calc(100vh - 56px);
  min-height: 0;
  background: var(--rl-bg);
}

.chat-layout {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
}

/* 第二栏：群列表 */
.group-column {
  display: flex;
  min-width: 0;
  flex: 0 0 220px;
  flex-direction: column;
  border-right: 1px solid var(--rl-border);
  background: #fdfbf7;
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 14px 12px;
  border-bottom: 1px solid var(--rl-border-light);
}

.group-kicker {
  color: var(--rl-primary);
  font-size: 10px;
  letter-spacing: 1px;
}

.group-head h1 {
  margin: 4px 0 0;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 17px;
  letter-spacing: 1px;
}

.group-count {
  min-width: 20px;
  padding: 1px 5px;
  border-radius: 9px;
  background: #fff1f0;
  color: var(--rl-primary);
  font-size: 10px;
  text-align: center;
}

.group-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  padding: 8px;
  overflow-y: auto;
}

.group-item {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--rl-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.group-item:hover {
  background: #fff8f7;
}

.group-item.active {
  border-color: #efc6cc;
  background: #fff1f0;
}

.group-avatar {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f1ece4;
  color: var(--rl-text-secondary);
  font-size: 14px;
}

.group-item.active .group-avatar {
  background: var(--rl-primary);
  color: #fff;
}

.group-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.group-copy strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-copy small {
  overflow: hidden;
  color: var(--rl-text-secondary);
  font-size: 10px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-foot {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 10px 12px;
  border-top: 1px solid var(--rl-border-light);
  color: var(--rl-text-secondary);
  font-size: 10px;
}

.online-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rl-success);
}

.online-dot.off {
  background: #c9c0b2;
}

.online-avatars {
  display: flex;
  align-items: center;
  margin-left: auto;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.mini-avatar {
  margin-left: -6px;
  border: 1px solid #fff;
  border-radius: 50%;
}

.mini-avatar:first-child {
  margin-left: 0;
}

.online-popover {
  display: flex;
  max-height: 280px;
  min-width: 160px;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.popover-title {
  margin: 0 0 2px;
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.popover-user {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--rl-text);
  font-size: 12px;
}

.popover-empty {
  color: var(--rl-text-secondary);
  font-size: 11px;
}

/* 第三栏：聊天 */
.chat-column {
  display: flex;
  min-width: 0;
  flex: 3 1 0;
  flex-direction: column;
  border-right: 1px solid var(--rl-border);
  background: var(--rl-bg);
}

.chat-head {
  display: flex;
  flex: 0 0 64px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 18px;
  border-bottom: 1px solid var(--rl-border);
  background: #fff;
}

.chat-title {
  margin: 0;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 19px;
  letter-spacing: 1px;
}

.chat-subtitle {
  margin: 3px 0 0;
  color: var(--rl-text-secondary);
  font-size: 10px;
}

.chat-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chat-conn {
  color: var(--rl-success);
  font-size: 10px;
}

.chat-conn.off {
  color: var(--rl-text-secondary);
}

.chat-proposal-shortcut {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--rl-border);
  border-radius: 5px;
  background: #fbf9f5;
  color: var(--rl-primary);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.chat-body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.message-area {
  flex: 1;
  min-height: 0;
  padding: 18px 22px;
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
  padding: 8px 14px 12px;
  border-top: 1px solid var(--rl-border);
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

/* 第四栏：功能面板 */
.function-panel {
  display: flex;
  min-width: 0;
  flex: 1 1 0;
  flex-direction: column;
  background: #fff;
  overflow: hidden;
}

.function-tabs {
  flex: 0 0 auto;
  padding: 12px 10px;
  border-bottom: 1px solid var(--rl-border);
  background: #fdfbf7;
}

.function-label {
  margin: 0 2px 7px;
  color: var(--rl-text-secondary);
  font-size: 9px;
  letter-spacing: 1px;
}

.function-tab {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border: 1px solid #efc6cc;
  border-radius: 5px;
  background: #fff1f0;
  color: var(--rl-primary);
  font-family: inherit;
  font-size: 12px;
  text-align: left;
}

.function-tab em {
  margin-left: auto;
  min-width: 16px;
  color: var(--rl-primary);
  font-size: 9px;
  font-style: normal;
  text-align: right;
}

.function-content {
  min-height: 0;
  flex: 1;
  padding: 14px;
  overflow-y: auto;
}

.proposal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--rl-border-light);
}

.proposal-kicker {
  color: var(--rl-primary);
  font-size: 9px;
  letter-spacing: 1px;
}

.proposal-head h2 {
  margin: 3px 0 0;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 17px;
  line-height: 1.4;
}

.proposal-new-btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
  padding: 4px 7px;
  border: 1px solid #e5cda6;
  border-radius: 4px;
  background: #fdf8ee;
  color: #946b2d;
  font-family: inherit;
  font-size: 9px;
  cursor: pointer;
}

.proposal-form {
  padding-top: 12px;
}

.proposal-field {
  display: block;
  margin-bottom: 9px;
}

.proposal-field > span {
  display: block;
  margin-bottom: 4px;
  color: var(--rl-text-tertiary);
  font-size: 10px;
}

.proposal-datetime {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--rl-border);
  border-radius: 5px;
  background: #fbf9f5;
  color: var(--rl-text);
  font-family: inherit;
  font-size: 11px;
}

.proposal-error {
  margin: 4px 0 7px;
  color: var(--rl-primary);
  font-size: 10px;
}

.proposal-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 5px;
  margin-top: 8px;
}

.proposal-cancel,
.proposal-submit {
  height: 28px;
  padding: 0 9px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.proposal-cancel {
  border: 1px solid var(--rl-border);
  background: #fff;
  color: var(--rl-text-secondary);
}

.proposal-submit {
  border: 1px solid var(--rl-primary);
  background: var(--rl-primary);
  color: #fff;
}

.proposal-submit:disabled {
  opacity: 0.6;
  cursor: wait;
}

.proposal-detail {
  padding-top: 12px;
}

.proposal-detail h3 {
  margin: 0;
  font-family: var(--rl-serif);
  font-size: 15px;
  line-height: 1.45;
}

.proposal-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 9px 0 10px;
  padding: 7px 8px;
  border-radius: 5px;
  background: #fbf9f5;
  color: var(--rl-text-secondary);
  font-size: 9px;
  line-height: 1.55;
}

.proposal-meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.proposal-content {
  white-space: pre-wrap;
  color: var(--rl-text-tertiary);
  font-size: 12px;
  line-height: 1.8;
}

.proposal-empty {
  display: flex;
  min-height: 130px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.proposal-empty > :first-child {
  color: #c9bda9;
  font-size: 24px;
}

.proposal-list-section {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--rl-border-light);
}

.proposal-list-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 7px;
}

.proposal-list-head h4 {
  margin: 0;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 12px;
}

.proposal-list-head span {
  color: var(--rl-text-secondary);
  font-size: 9px;
}

.proposal-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.proposal-item {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--rl-border-light);
  border-radius: 5px;
  background: #fffdfb;
  color: var(--rl-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.proposal-item:hover,
.proposal-item.active {
  border-color: #e5cda6;
  background: #fdf8ee;
}

.proposal-item strong {
  display: -webkit-box;
  overflow: hidden;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.proposal-item span {
  overflow: hidden;
  color: var(--rl-text-secondary);
  font-size: 9px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.proposal-list-empty {
  margin: 6px 0;
  color: var(--rl-text-secondary);
  font-size: 9px;
}

@media (max-width: 1199px) {
  .group-column {
    flex-basis: 190px;
  }

  .chat-head {
    padding: 0 14px;
  }

  .function-content {
    padding: 12px;
  }
}

@media (max-width: 900px) {
  .group-column {
    flex-basis: 170px;
  }

  .chat-proposal-shortcut {
    display: none;
  }
}

@media (max-width: 767px) {
  .chat-page {
    height: auto;
    min-height: calc(100vh - 56px - 80px);
  }

  .chat-layout {
    flex-wrap: wrap;
  }

  .group-column {
    width: 100%;
    flex: 0 0 auto;
    border-right: 0;
    border-bottom: 1px solid var(--rl-border);
  }

  .group-head {
    padding: 10px 12px 8px;
  }

  .group-head h1 {
    font-size: 15px;
  }

  .group-list {
    flex-direction: row;
    gap: 5px;
    padding: 6px 8px;
    overflow-x: auto;
  }

  .group-item {
    width: 150px;
    flex: 0 0 auto;
    padding: 7px;
  }

  .group-foot {
    display: none;
  }

  .chat-column {
    width: 100%;
    flex: 0 0 auto;
    min-height: 68vh;
    border-right: 0;
  }

  .function-panel {
    width: 100%;
    flex: 0 0 auto;
    border-top: 1px solid var(--rl-border);
  }

  .message-area {
    padding: 12px;
  }
}
</style>
