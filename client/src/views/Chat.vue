<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { io, type Socket } from 'socket.io-client';
import { message } from 'ant-design-vue';
import {
  ClockCircleOutlined,
  CloseOutlined,
  FileTextOutlined,
  PictureOutlined,
  PlusOutlined,
  SendOutlined,
  TeamOutlined,
} from '@ant-design/icons-vue';
import AppShell from '@/components/layout/AppShell.vue';
import ChatMessage from '@/components/chat/ChatMessage.vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { apiChatAtAll, apiChatHistory, apiOnline } from '@/api/chat';
import { apiCreateProposal, apiProposals } from '@/api/proposals';
import { apiUploadImage } from '@/api/upload';
import { apiErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import type { ChatMessage as ChatMessageType, OnlineSnapshot, PostAuthor, Proposal } from '@/types';

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

const proposals = ref<Proposal[]>([]);
const proposalPanelOpen = ref(false);
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
const atAll = ref({ limit: 3, used: 0, remaining: 3, weekStart: '' });

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

function emitMessage(
  payload: { type: 1 | 2; content: string },
  onSuccess?: (ack: { ok: boolean; atAllRemaining?: number | null }) => void,
) {
  if (!socket?.connected) {
    message.warning('聊天室正在连接，请稍后再试');
    return false;
  }
  socket.emit('chat:send', payload, (ack?: { ok: boolean; msg?: string; atAllRemaining?: number | null }) => {
    if (!ack?.ok) {
      message.error(ack?.msg || '消息发送失败');
      return;
    }
    onSuccess?.(ack);
  });
  return true;
}

function sendText() {
  const content = draft.value.trim();
  if (!content) return;
  emitMessage({ type: 1, content }, (ack) => {
    draft.value = '';
    if (content.includes('@所有人')) {
      if (typeof ack.atAllRemaining === 'number') atAll.value.remaining = ack.atAllRemaining;
      void loadAtAllUsage();
    }
  });
}

async function loadAtAllUsage() {
  try {
    atAll.value = await apiChatAtAll();
  } catch {
    // 统计接口失败不影响聊天主流程
  }
}

function insertAtAll() {
  if (atAll.value.remaining <= 0) {
    message.warning('本周 @所有人 次数已用完');
    return;
  }
  if (draft.value.includes('@所有人')) {
    message.info('消息中已经包含 @所有人');
    return;
  }
  draft.value = `${draft.value}${draft.value ? ' ' : ''}@所有人 `;
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
  } catch (err) {
    message.error(apiErrorMessage(err));
  }
}

function openProposalPanel() {
  proposalPanelOpen.value = !proposalPanelOpen.value;
  if (!proposalPanelOpen.value) return;
  if (!selectedProposal.value && proposals.value.length) {
    selectedProposal.value = proposals.value[0];
    proposalFormOpen.value = false;
  }
  if (!proposals.value.length) startNewProposal();
}

function selectProposal(proposal: Proposal) {
  selectedProposal.value = proposal;
  proposalFormOpen.value = false;
  proposalPanelOpen.value = true;
}

function startNewProposal() {
  selectedProposal.value = null;
  proposalFormOpen.value = true;
  proposalPanelOpen.value = true;
  proposalError.value = '';
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

function cancelProposalForm() {
  proposalFormOpen.value = false;
  proposalError.value = '';
  if (proposals.value.length) {
    selectedProposal.value = proposals.value[0];
  } else {
    proposalPanelOpen.value = false;
  }
}

async function submitProposal() {  proposalError.value = '';
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
    await loadProposals();
    selectedProposal.value = created;
    proposalFormOpen.value = false;
    proposalPanelOpen.value = true;
  } catch (err) {
    proposalError.value = apiErrorMessage(err);
  } finally {
    proposalSubmitting.value = false;
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
  await Promise.all([loadAtAllUsage(), loadProposals()]);
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
          <button class="mobile-proposal-entry" type="button" @click="openProposalPanel">
            <FileTextOutlined /> 提案
          </button>
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

      <div class="chat-workspace" :class="{ 'proposal-open': proposalPanelOpen }">
        <div class="chat-main-column">
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
            <button
              class="tool-btn at-all-btn"
              type="button"
              :disabled="atAll.remaining <= 0"
              :title="`@所有人：本周剩余 ${atAll.remaining} 次`"
              data-testid="chat-at-all"
              @click="insertAtAll"
            >
              <TeamOutlined />
              <span>@所有人</span>
              <em>{{ atAll.remaining }}/{{ atAll.limit }}</em>
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

        <aside v-if="proposalPanelOpen" class="proposal-panel card" data-testid="proposal-panel">
          <header class="proposal-panel-head">
            <div>
              <span class="proposal-kicker">提案</span>
              <h2>{{ proposalFormOpen ? '发起提案' : selectedProposal ? '提案详情' : '提案' }}</h2>
            </div>
            <button class="panel-close" type="button" aria-label="关闭提案面板" @click="proposalPanelOpen = false">
              <CloseOutlined />
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
                :rows="6"
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
            <div class="proposal-detail-actions">
              <button class="proposal-new-btn" type="button" @click="startNewProposal">
                <PlusOutlined /> 发起新提案
              </button>
            </div>
          </div>

          <div v-else class="proposal-empty">
            <FileTextOutlined />
            <p>还没有提案</p>
            <button class="proposal-new-btn" type="button" @click="startNewProposal">
              <PlusOutlined /> 发起提案
            </button>
          </div>
        </aside>

        <aside class="chat-rail" data-testid="chat-rail">
          <p class="rail-heading">功能</p>
          <button
            class="rail-option"
            :class="{ active: proposalPanelOpen }"
            type="button"
            data-testid="proposal-option"
            @click="openProposalPanel"
          >
            <FileTextOutlined />
            <span>提案</span>
            <em>{{ proposals.length }}</em>
          </button>

          <div class="rail-proposals" data-testid="proposal-mini-list">
            <p class="rail-subheading">提案预览</p>
            <button
              v-for="proposal in proposals"
              :key="proposal.id"
              class="proposal-mini"
              :class="{ active: selectedProposal?.id === proposal.id }"
              type="button"
              data-testid="proposal-mini"
              @click="selectProposal(proposal)"
            >
              <strong>{{ proposal.title }}</strong>
              <span>{{ proposal.user.nickname }} · {{ formatProposalTime(proposal.proposalTime) }}</span>
            </button>
            <p v-if="!proposals.length" class="rail-empty">暂无提案</p>
          </div>

          <button class="rail-new" type="button" data-testid="proposal-new" @click="startNewProposal">
            <PlusOutlined /> 发起提案
          </button>
        </aside>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.chat-page {
  display: flex;
  height: calc(100vh - 88px);
  flex-direction: column;
  gap: 12px;
  padding-left: 26px;
}

.chat-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  flex: 1;
  min-height: 0;
  gap: 12px;
}

.chat-workspace.proposal-open {
  grid-template-columns: minmax(0, 1fr) 340px 220px;
}

.chat-main-column {
  display: flex;
  min-width: 0;
  min-height: 0;
}

.chat-main-column .chat-body {
  flex: 1;
  height: 100%;
}

.chat-rail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  padding: 14px 12px;
  border: 1px solid var(--rl-border);
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--rl-shadow);
  overflow-y: auto;
}

.rail-heading {
  margin: 0 0 2px;
  color: var(--rl-text-secondary);
  font-size: 10px;
  letter-spacing: 1px;
}

.rail-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 7px;
  padding: 9px 10px;
  border: 1px solid var(--rl-border-light);
  border-radius: 6px;
  background: #fbf9f5;
  color: var(--rl-text);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.rail-option:hover,
.rail-option.active {
  border-color: #efc6cc;
  background: #fff1f0;
  color: var(--rl-primary);
}

.rail-option em {
  margin-left: auto;
  min-width: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: #fff;
  color: var(--rl-primary);
  font-size: 10px;
  font-style: normal;
  line-height: 17px;
  text-align: center;
}

.rail-subheading {
  margin: 8px 0 2px;
  color: var(--rl-text-secondary);
  font-size: 10px;
}

.rail-proposals {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.proposal-mini {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 4px;
  padding: 9px 10px;
  border: 1px solid var(--rl-border-light);
  border-radius: 6px;
  background: #fffdfb;
  color: var(--rl-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.proposal-mini:hover,
.proposal-mini.active {
  border-color: #e5cda6;
  background: #fdf8ee;
}

.proposal-mini strong {
  display: -webkit-box;
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.proposal-mini span {
  overflow: hidden;
  color: #a49784;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-empty {
  margin: 4px 0;
  color: var(--rl-text-secondary);
  font-size: 11px;
  text-align: center;
}

.rail-new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: auto;
  padding: 7px;
  border: 1px dashed #e5cda6;
  border-radius: 6px;
  background: transparent;
  color: #946b2d;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.rail-new:hover {
  background: #fdf8ee;
}

.proposal-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 18px;
  overflow-y: auto;
}

.proposal-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--rl-border-light);
}

.proposal-kicker {
  color: var(--rl-primary);
  font-size: 10px;
  letter-spacing: 1px;
}

.proposal-panel-head h2 {
  margin: 4px 0 0;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 18px;
  line-height: 1.45;
}

.panel-close {
  display: inline-flex;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--rl-border);
  border-radius: 5px;
  background: #fff;
  color: var(--rl-text-secondary);
  cursor: pointer;
}

.proposal-form {
  padding-top: 14px;
}

.proposal-field {
  display: block;
  margin-bottom: 11px;
}

.proposal-field > span {
  display: block;
  margin-bottom: 5px;
  color: var(--rl-text-tertiary);
  font-size: 11px;
}

.proposal-datetime {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--rl-border);
  border-radius: 6px;
  background: #fbf9f5;
  color: var(--rl-text);
  font-family: inherit;
  font-size: 12px;
}

.proposal-error {
  margin: 4px 0 8px;
  color: var(--rl-primary);
  font-size: 11px;
}

.proposal-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}

.proposal-cancel,
.proposal-submit {
  height: 30px;
  padding: 0 12px;
  border-radius: 5px;
  font-family: inherit;
  font-size: 11px;
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
  padding-top: 14px;
}

.proposal-detail h3 {
  margin: 0;
  font-family: var(--rl-serif);
  font-size: 17px;
  line-height: 1.5;
}

.proposal-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 10px 0 14px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #fbf9f5;
  color: var(--rl-text-secondary);
  font-size: 10px;
  line-height: 1.6;
}

.proposal-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.proposal-content {
  white-space: pre-wrap;
  color: var(--rl-text-tertiary);
  font-size: 13px;
  line-height: 1.9;
}

.proposal-detail-actions {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--rl-border-light);
}

.proposal-new-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid #e5cda6;
  border-radius: 5px;
  background: #fdf8ee;
  color: #946b2d;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.proposal-empty {
  display: flex;
  min-height: 180px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--rl-text-secondary);
  font-size: 12px;
}

.proposal-empty > :first-child {
  color: #c9bda9;
  font-size: 28px;
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

.at-all-btn em {
  padding: 0 4px;
  border-radius: 8px;
  background: #fff1f0;
  color: var(--rl-primary);
  font-size: 9px;
  font-style: normal;
  line-height: 15px;
}

.at-all-btn:disabled {
  color: #b9afa0;
  background: transparent;
  cursor: not-allowed;
}

.at-all-btn:disabled em {
  background: #f1f2f4;
  color: #9a9287;
}

.mobile-proposal-entry {
  display: none;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--rl-border);
  border-radius: 5px;
  background: #fbf9f5;
  color: var(--rl-primary);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
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

@media (max-width: 1199px) {
  .chat-page {
    padding-left: 16px;
  }

  .chat-workspace {
    grid-template-columns: minmax(0, 1fr) 210px;
  }

  .chat-workspace.proposal-open {
    grid-template-columns: minmax(0, 1fr) 290px 180px;
  }
}

@media (max-width: 900px) {
  .chat-page {
    padding-left: 0;
  }

  .chat-workspace,
  .chat-workspace.proposal-open {
    grid-template-columns: minmax(0, 1fr);
  }

  .chat-rail {
    display: none;
  }

  .chat-workspace.proposal-open .proposal-panel {
    position: fixed;
    z-index: 100;
    inset: 70px 12px 84px;
    box-shadow: 0 16px 50px rgba(60, 20, 20, 0.2);
  }

  .mobile-proposal-entry {
    display: inline-flex;
  }
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

  .chat-workspace.proposal-open .proposal-panel {
    inset: 60px 8px 76px;
  }
}
</style>
