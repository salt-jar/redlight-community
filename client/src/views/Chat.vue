<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { message } from 'ant-design-vue';
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  LikeFilled,
  LikeOutlined,
  MessageOutlined,
  PictureOutlined,
  PlusOutlined,
  SendOutlined,
} from '@ant-design/icons-vue';
import AppShell from '@/components/layout/AppShell.vue';
import ChatMessage from '@/components/chat/ChatMessage.vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { apiChatGroups, apiChatHistory, apiOnline } from '@/api/chat';
import {
  apiCommentProposal,
  apiCreateProposal,
  apiProposalComments,
  apiProposalDetail,
  apiProposals,
  apiVoteProposal,
} from '@/api/proposals';
import { apiUploadImage } from '@/api/upload';
import { apiErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import type {
  ChatGroup,
  ChatMessage as ChatMessageType,
  OnlineSnapshot,
  PostAuthor,
  Proposal,
  ProposalComment,
} from '@/types';

const GROUP_STORAGE_KEY = 'redlight_chat_group';
const auth = useAuthStore();

const messages = ref<ChatMessageType[]>([]);
const onlineUsers = ref<PostAuthor[]>([]);
const groups = ref<ChatGroup[]>([]);
const activeGroupId = ref(1);
const functionOpen = ref(false);
const functionCreateOpen = ref(false);
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
const proposalsLoading = ref(false);
const activeProposal = ref<Proposal | null>(null);
const proposalDetailLoading = ref(false);
const proposalComments = ref<ProposalComment[]>([]);
const proposalCommentDraft = ref('');
const proposalCommentSending = ref(false);
const proposalVotePending = ref(false);
const proposalDiscussionEl = ref<HTMLElement | null>(null);
let proposalRequest = 0;
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
      if (payload.proposalId && activeProposal.value?.id === payload.proposalId) {
        void refreshProposalComments(payload.proposalId);
      }
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
  activeProposal.value = null;
  proposalComments.value = [];
  functionOpen.value = false;
  functionCreateOpen.value = false;
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
  proposalsLoading.value = true;
  try {
    proposals.value = await apiProposals(50);
  } catch (err) {
    message.error(apiErrorMessage(err));
  } finally {
    proposalsLoading.value = false;
  }
}

function toggleFunctionPanel() {
  functionOpen.value = !functionOpen.value;
  if (functionOpen.value) {
    functionCreateOpen.value = false;
    void loadProposals();
  }
}

function closeFunctionPanel() {
  functionOpen.value = false;
  functionCreateOpen.value = false;
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
  functionOpen.value = true;
  functionCreateOpen.value = true;
  proposalError.value = '';
  prepareProposalForm();
}

function cancelProposalForm() {
  functionCreateOpen.value = false;
  proposalError.value = '';
}

async function scrollProposalDiscussion() {
  await nextTick();
  const el = proposalDiscussionEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

async function refreshProposalComments(proposalId: number) {
  if (activeProposal.value?.id !== proposalId) return;
  try {
    const comments = await apiProposalComments(proposalId);
    if (activeProposal.value?.id === proposalId) {
      proposalComments.value = comments;
      await scrollProposalDiscussion();
    }
  } catch {
    // 讨论区实时刷新失败不打断阅读
  }
}

async function openProposalDetail(input: Proposal | number) {
  const id = typeof input === 'number' ? input : input.id;
  const requestId = ++proposalRequest;
  if (typeof input !== 'number') activeProposal.value = input;
  proposalDetailLoading.value = true;
  proposalComments.value = [];
  functionCreateOpen.value = false;
  try {
    const [detail, comments] = await Promise.all([apiProposalDetail(id), apiProposalComments(id)]);
    if (requestId !== proposalRequest) return;
    activeProposal.value = detail;
    proposalComments.value = comments;
    functionOpen.value = false;
    await scrollProposalDiscussion();
  } catch (err) {
    if (requestId === proposalRequest) {
      activeProposal.value = null;
      message.error(apiErrorMessage(err));
    }
  } finally {
    if (requestId === proposalRequest) proposalDetailLoading.value = false;
  }
}

function closeProposalDetail() {
  proposalRequest += 1;
  activeProposal.value = null;
  proposalComments.value = [];
  proposalCommentDraft.value = '';
  functionOpen.value = true;
  void loadProposals();
}

function openProposalFromMessage(proposalId: number) {
  void openProposalDetail(proposalId);
}

async function toggleProposalVote() {
  if (!activeProposal.value || proposalVotePending.value) return;
  proposalVotePending.value = true;
  try {
    const result = await apiVoteProposal(activeProposal.value.id);
    activeProposal.value = {
      ...activeProposal.value,
      voted: result.voted,
      voteCount: result.voteCount,
    };
  } catch (err) {
    message.error(apiErrorMessage(err));
  } finally {
    proposalVotePending.value = false;
  }
}

async function sendProposalComment() {
  if (!activeProposal.value || proposalCommentSending.value) return;
  const content = proposalCommentDraft.value.trim();
  if (!content) return;
  if (Array.from(content).length > 2000) {
    message.error('提案讨论单条不能超过 2000 字');
    return;
  }
  proposalCommentSending.value = true;
  try {
    const result = await apiCommentProposal(activeProposal.value.id, content, activeGroupId.value);
    proposalCommentDraft.value = '';
    if (!proposalComments.value.some((comment) => comment.id === result.comment.id)) {
      proposalComments.value.push(result.comment);
    }
    activeProposal.value = {
      ...activeProposal.value,
      commentCount: result.proposal.commentCount,
    };
    if (
      result.message.groupId === activeGroupId.value &&
      !messages.value.some((item) => item.id === result.message.id)
    ) {
      messages.value.push(result.message);
    }
    await scrollProposalDiscussion();
    await nextTick(scrollToBottom);
  } catch (err) {
    message.error(apiErrorMessage(err));
  } finally {
    proposalCommentSending.value = false;
  }
}

function onProposalCommentKeydown(event: KeyboardEvent) {
  if (event.shiftKey) return;
  event.preventDefault();
  void sendProposalComment();
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
    await apiCreateProposal({
      title: proposalForm.value.title.trim(),
      proposalTime: proposalForm.value.proposalTime,
      proposerInfo: proposalForm.value.proposerInfo.trim(),
      content: proposalForm.value.content.trim(),
    });
    message.success('提案已提交');
    functionCreateOpen.value = false;
    await loadProposals();
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

        <section v-if="activeProposal" class="proposal-detail-page" data-testid="proposal-detail-page">
          <header class="proposal-detail-head">
            <button class="proposal-back" type="button" data-testid="proposal-back" @click="closeProposalDetail">
              <ArrowLeftOutlined /> 返回提案列表
            </button>
            <span class="proposal-detail-status">提案详情 · 讨论同步群聊</span>
          </header>

          <div class="proposal-detail-scroll">
            <div v-if="proposalDetailLoading" class="proposal-detail-loading">正在加载提案...</div>
            <template v-else>
              <article class="proposal-full" data-testid="proposal-detail">
                <span class="proposal-kicker">提案正文</span>
                <h1>{{ activeProposal.title }}</h1>
                <div class="proposal-meta proposal-detail-meta">
                  <span><ClockCircleOutlined /> 提案时间：{{ formatProposalTime(activeProposal.proposalTime) }}</span>
                  <span>发起人：{{ activeProposal.proposerInfo }}</span>
                  <span>记录于 {{ formatCreatedAt(activeProposal.createdAt) }}</span>
                </div>
                <div class="proposal-full-content">{{ activeProposal.content }}</div>
                <div class="proposal-vote-row">
                  <button
                    class="proposal-vote-btn"
                    :class="{ voted: activeProposal.voted }"
                    type="button"
                    :disabled="proposalVotePending"
                    data-testid="proposal-vote"
                    @click="toggleProposalVote"
                  >
                    <LikeFilled v-if="activeProposal.voted" />
                    <LikeOutlined v-else />
                    {{ activeProposal.voted ? '已投票支持' : '投票支持' }}
                    <strong>{{ activeProposal.voteCount }}</strong>
                  </button>
                  <span class="proposal-vote-hint">赞成该提案的同志可投票，再次点击取消</span>
                </div>
              </article>

              <section class="proposal-discussion">
                <header class="proposal-discussion-head">
                  <div>
                    <h2>提案讨论</h2>
                    <p>区别于普通回复，支持连续长讨论；发言会同步到群聊「{{ activeGroup?.name || '当前群聊' }}」。</p>
                  </div>
                  <span>{{ activeProposal.commentCount }} 条发言</span>
                </header>
                <div ref="proposalDiscussionEl" class="proposal-discussion-list" data-testid="proposal-comments">
                  <p v-if="!proposalComments.length" class="proposal-discussion-empty">还没有同志发言，来发表第一条意见。</p>
                  <article v-for="comment in proposalComments" :key="comment.id" class="proposal-comment">
                    <UserAvatar :user="comment.user" :size="32" />
                    <div class="proposal-comment-main">
                      <div class="proposal-comment-meta">
                        <strong>{{ comment.user.nickname }}</strong>
                        <span v-if="comment.user.isAdmin" class="admin-badge">管理员</span>
                        <span>{{ formatCreatedAt(comment.createdAt) }}</span>
                      </div>
                      <p>{{ comment.content }}</p>
                    </div>
                  </article>
                </div>
              </section>
            </template>
          </div>

          <footer class="proposal-composer">
            <p class="proposal-sync-tip">提案讨论会同步到「{{ activeGroup?.name || '当前群聊' }}」</p>
            <div class="proposal-composer-row">
              <a-textarea
                v-model:value="proposalCommentDraft"
                :auto-size="{ minRows: 1, maxRows: 4 }"
                :maxlength="2000"
                placeholder="在提案内发表意见...（Enter 发送，Shift+Enter 换行）"
                data-testid="proposal-comment-input"
                @press-enter="onProposalCommentKeydown"
              />
              <button
                class="send-btn"
                type="button"
                :disabled="!proposalCommentDraft.trim() || proposalCommentSending"
                data-testid="proposal-comment-send"
                @click="sendProposalComment"
              >
                <SendOutlined />
                发言
              </button>
            </div>
          </footer>
        </section>

        <template v-else>
          <section class="chat-column">
            <header class="chat-head">
              <div class="chat-title-wrap">
                <h2 class="chat-title">{{ activeGroup?.name || '群聊' }}</h2>
                <p class="chat-subtitle">{{ activeGroup?.description || '思想交流 · 互相学习 · 共同进步' }}</p>
              </div>
              <div class="chat-status">
                <span class="chat-conn" :class="{ off: !connected }">{{ connected ? '已连接' : '连接中...' }}</span>
                <button
                  class="chat-proposal-shortcut"
                  :class="{ active: functionOpen }"
                  type="button"
                  data-testid="function-trigger"
                  @click="toggleFunctionPanel"
                >
                  <AppstoreOutlined /> 功能
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
                    @open-proposal="openProposalFromMessage"
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

          <aside v-if="functionOpen" class="function-panel" data-testid="proposal-panel">
            <header class="function-panel-head">
              <div>
                <span class="function-kicker">功能</span>
                <h2>提案</h2>
              </div>
              <button class="panel-close" type="button" aria-label="收起功能面板" @click="closeFunctionPanel">
                <CloseOutlined />
              </button>
            </header>

            <div class="function-content">
              <form v-if="functionCreateOpen" class="proposal-form" @submit.prevent="submitProposal">
                <button class="proposal-back-list" type="button" @click="cancelProposalForm">
                  <ArrowLeftOutlined /> 返回提案列表
                </button>
                <h3 class="proposal-form-title">发起提案</h3>
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

              <template v-else>
                <header class="proposal-head">
                  <div>
                    <span class="proposal-kicker">提案列表</span>
                    <h2>共 {{ proposals.length }} 条提案</h2>
                  </div>
                  <button class="proposal-new-btn" type="button" data-testid="proposal-new" @click="startNewProposal">
                    <PlusOutlined /> 发起
                  </button>
                </header>

                <a-spin :spinning="proposalsLoading">
                  <p v-if="!proposals.length" class="proposal-list-empty">暂无提案，点击「发起」创建第一条。</p>
                  <div v-else class="proposal-list">
                    <button
                      v-for="proposal in proposals"
                      :key="proposal.id"
                      class="proposal-item"
                      type="button"
                      data-testid="proposal-mini"
                      @click="openProposalDetail(proposal)"
                    >
                      <strong>{{ proposal.title }}</strong>
                      <span>{{ proposal.proposerInfo }}</span>
                      <span>{{ formatProposalTime(proposal.proposalTime) }}</span>
                      <span class="proposal-item-stats">
                        <LikeOutlined /> {{ proposal.voteCount }} · <MessageOutlined /> {{ proposal.commentCount }}
                      </span>
                    </button>
                  </div>
                </a-spin>
              </template>
            </div>
          </aside>
        </template>
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

.chat-proposal-shortcut.active {
  border-color: #efc6cc;
  background: #fff1f0;
}

.function-panel-head {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 12px 12px;
  border-bottom: 1px solid var(--rl-border);
  background: #fdfbf7;
}

.function-kicker {
  color: var(--rl-primary);
  font-size: 9px;
  letter-spacing: 1px;
}

.function-panel-head h2 {
  margin: 3px 0 0;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 17px;
}

.panel-close {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--rl-border);
  border-radius: 4px;
  background: #fff;
  color: var(--rl-text-secondary);
  cursor: pointer;
}

.proposal-back-list {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-bottom: 10px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--rl-primary);
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.proposal-form-title {
  margin: 0 0 12px;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 17px;
}

.proposal-item-stats {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #946b2d !important;
}

/* 提案详情页（替代聊天主区 + 功能面板） */
.proposal-detail-page {
  display: flex;
  min-width: 0;
  flex: 1 1 0;
  flex-direction: column;
  background: #fff;
}

.proposal-detail-head {
  display: flex;
  flex: 0 0 56px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 22px;
  border-bottom: 1px solid var(--rl-border);
  background: #fdfbf7;
}

.proposal-back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border: 1px solid var(--rl-border);
  border-radius: 5px;
  background: #fff;
  color: var(--rl-primary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.proposal-back:hover {
  background: #fff1f0;
}

.proposal-detail-status {
  color: var(--rl-text-secondary);
  font-size: 10px;
}

.proposal-detail-scroll {
  min-height: 0;
  flex: 1;
  padding: 28px 34px 40px;
  overflow-y: auto;
}

.proposal-detail-loading {
  padding: 60px;
  color: var(--rl-text-secondary);
  font-size: 13px;
  text-align: center;
}

.proposal-full {
  padding-bottom: 22px;
  border-bottom: 1px solid var(--rl-border-light);
}

.proposal-full h1 {
  margin: 6px 0 14px;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: clamp(24px, 2.2vw, 34px);
  line-height: 1.35;
}

.proposal-detail-meta {
  max-width: 820px;
  margin-bottom: 20px;
}

.proposal-full-content {
  max-width: 1000px;
  color: var(--rl-text);
  font-family: var(--rl-serif);
  font-size: 16px;
  line-height: 2;
  white-space: pre-wrap;
}

.proposal-vote-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 24px;
  flex-wrap: wrap;
}

.proposal-vote-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid #efc6cc;
  border-radius: 6px;
  background: #fff8f7;
  color: var(--rl-primary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.proposal-vote-btn strong {
  padding-left: 3px;
  font-size: 14px;
}

.proposal-vote-btn.voted {
  background: var(--rl-primary);
  color: #fff;
}

.proposal-vote-hint {
  color: var(--rl-text-secondary);
  font-size: 10px;
}

.proposal-discussion {
  margin-top: 24px;
}

.proposal-discussion-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--rl-border-light);
}

.proposal-discussion-head h2 {
  margin: 0;
  color: var(--rl-deep);
  font-family: var(--rl-serif);
  font-size: 18px;
}

.proposal-discussion-head p {
  margin: 4px 0 0;
  color: var(--rl-text-secondary);
  font-size: 10px;
}

.proposal-discussion-head > span {
  flex: 0 0 auto;
  color: var(--rl-text-secondary);
  font-size: 10px;
}

.proposal-discussion-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.proposal-discussion-empty {
  padding: 22px 0;
  color: var(--rl-text-secondary);
  font-size: 12px;
  text-align: center;
}

.proposal-comment {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--rl-border-light);
  border-radius: 7px;
  background: #fffdfb;
}

.proposal-comment-main {
  min-width: 0;
  flex: 1;
}

.proposal-comment-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--rl-text-secondary);
  font-size: 9px;
}

.proposal-comment-meta strong {
  color: var(--rl-text);
  font-size: 11px;
}

.proposal-comment-main p {
  margin: 5px 0 0;
  color: var(--rl-text);
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
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

.proposal-composer {
  flex: 0 0 auto;
  padding: 8px 22px 14px;
  border-top: 1px solid var(--rl-border);
  background: #fdfbf7;
}

.proposal-sync-tip {
  margin: 0 0 6px;
  color: #946b2d;
  font-size: 10px;
}

.proposal-composer-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

@media (max-width: 1199px) {
  .proposal-detail-scroll {
    padding: 22px 24px 34px;
  }
}

@media (max-width: 767px) {
  .proposal-detail-head {
    padding: 0 12px;
  }

  .proposal-detail-scroll {
    padding: 16px 14px 28px;
  }

  .proposal-full h1 {
    font-size: 24px;
  }

  .proposal-full-content {
    font-size: 14px;
  }

  .proposal-composer {
    padding: 8px 12px 12px;
  }
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
