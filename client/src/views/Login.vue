<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IdcardOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  UserAddOutlined,
} from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { apiErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { isValidEmail } from '@/utils/validate';

type AuthMode = 'login' | 'register';
const USERNAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{4,20}$/;

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const mode = ref<AuthMode>('login');
const email = ref('');
const code = ref('');
const username = ref('');
const sending = ref(false);
const submitting = ref(false);
const countdown = ref(0);
const error = ref('');
const devCode = ref('');
let timer: ReturnType<typeof setInterval> | null = null;

const usernameValid = computed(() => USERNAME_RE.test(username.value));
const usernameError = computed(
  () => mode.value === 'register' && Boolean(username.value) && !usernameValid.value,
);
const canSend = computed(() => countdown.value === 0 && !sending.value && isValidEmail(email.value));
const canSubmit = computed(
  () =>
    isValidEmail(email.value) &&
    /^\d{6}$/.test(code.value) &&
    !submitting.value &&
    (mode.value === 'login' || usernameValid.value),
);

// 从输入源头过滤特殊符号 / 空格，只保留中文、字母、数字、下划线
watch(username, (value) => {
  const cleaned = value.replace(/[^A-Za-z0-9_\u4e00-\u9fa5]/g, '').slice(0, 20);
  if (cleaned !== value) username.value = cleaned;
});

function switchMode(next: AuthMode) {
  if (mode.value === next) return;
  mode.value = next;
  code.value = '';
  error.value = '';
  devCode.value = '';
}

function startCountdown(seconds: number) {
  countdown.value = Math.max(1, Math.floor(seconds));
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0 && timer) {
      clearInterval(timer);
      timer = null;
      countdown.value = 0;
    }
  }, 1000);
}

async function sendCode() {
  if (!isValidEmail(email.value)) {
    error.value = '请输入正确的邮箱地址';
    return;
  }
  if (!canSend.value) return;
  sending.value = true;
  error.value = '';
  try {
    const result = await auth.sendCode(email.value.trim(), mode.value);
    devCode.value = result.devCode || '';
    startCountdown(result.cooldown || 60);
    message.success('验证码已发送，请查收邮箱');
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    sending.value = false;
  }
}

async function submit() {
  if (!isValidEmail(email.value)) {
    error.value = '请输入正确的邮箱地址';
    return;
  }
  if (!/^\d{6}$/.test(code.value)) {
    error.value = '请输入 6 位数字验证码';
    return;
  }
  if (mode.value === 'register' && !usernameValid.value) {
    error.value = '用户名 ID 需为 4–20 位中文、字母、数字或下划线';
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    if (mode.value === 'login') {
      await auth.login(email.value.trim(), code.value.trim());
      message.success('欢迎回来，同志');
    } else {
      const result = await auth.register({
        email: email.value.trim(),
        code: code.value.trim(),
        username: username.value.trim(),
      });
      message.success(`注册成功，你的社区号：${result.user.communityNo}`);
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.replace(redirect.startsWith('/') ? redirect : '/');
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    submitting.value = false;
  }
}

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="login-page">
    <div class="bg-decor" aria-hidden="true">
      <svg class="decor gear" viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="68" stroke="#C8102E" stroke-width="2" />
        <circle cx="100" cy="100" r="42" stroke="#C8102E" stroke-width="2" />
        <path
          d="M100 12v18M100 170v18M12 100h18M170 100h18M38 38l13 13M149 149l13 13M162 38l-13 13M51 149l-13 13"
          stroke="#C8102E"
          stroke-width="2"
        />
      </svg>
      <svg class="decor flag" viewBox="0 0 320 200" fill="none">
        <path d="M38 20v160" stroke="#C8102E" stroke-width="3" />
        <path d="M38 24c60-18 112 22 172 4v96c-60 18-112-22-172-4V24Z" stroke="#C8102E" stroke-width="2" />
        <path d="M74 66l7 16 17 1-13 11 4 17-15-8-15 8 4-17-13-11 17-1Z" stroke="#C8102E" stroke-width="2" />
      </svg>
      <svg class="decor wheat" viewBox="0 0 160 260" fill="none">
        <path d="M80 250V70" stroke="#C8102E" stroke-width="2" />
        <path d="M80 120c-24-2-40-18-42-42 24 2 40 18 42 42Zm0 0c24-2 40-18 42-42-24 2-40 18-42 42Z" stroke="#C8102E" stroke-width="2" />
        <path d="M80 170c-24-2-40-18-42-42 24 2 40 18 42 42Zm0 0c24-2 40-18 42-42-24 2-40 18-42 42Z" stroke="#C8102E" stroke-width="2" />
      </svg>
      <svg class="decor gate" viewBox="0 0 460 190" fill="none">
        <path d="M28 180h404M80 180v-58h300v58" stroke="#C8102E" stroke-width="2" />
        <path d="M62 122h336l-36-24H98l-36 24Z" stroke="#C8102E" stroke-width="2" />
        <path d="M100 98h260l-28-22H128l-28 22Z" stroke="#C8102E" stroke-width="2" />
        <path d="M204 180v-30a26 26 0 0 1 52 0v30M128 180v-20a14 14 0 0 1 28 0v20M304 180v-20a14 14 0 0 1 28 0v20" stroke="#C8102E" stroke-width="2" />
        <path d="M80 146h30M350 146h30M150 76h160" stroke="#C8102E" stroke-width="2" />
      </svg>
      <span class="decor-star">★</span>
    </div>

    <main class="login-main">
      <section class="login-hero">
        <span class="hero-star">★</span>
        <h1 class="hero-title">赤光社</h1>
        <p class="hero-en">R E D L I G H T</p>
        <p class="hero-slogan">为了新世界，学习理论，团结同志</p>
      </section>

      <section class="login-card">
        <div class="auth-tabs" role="tablist" aria-label="登录或注册">
          <button
            class="auth-tab"
            :class="{ active: mode === 'login' }"
            type="button"
            role="tab"
            :aria-selected="mode === 'login'"
            data-testid="login-tab-login"
            @click="switchMode('login')"
          >
            登录
          </button>
          <button
            class="auth-tab"
            :class="{ active: mode === 'register' }"
            type="button"
            role="tab"
            :aria-selected="mode === 'register'"
            data-testid="login-tab-register"
            @click="switchMode('register')"
          >
            注册
          </button>
        </div>

        <h2 class="card-title">{{ mode === 'login' ? '欢迎回来' : '加入赤光社' }}</h2>
        <p class="card-subtitle">
          {{ mode === 'login' ? '使用已注册的邮箱验证码登录' : '设置独一无二的用户名 ID，与同志们建立联系' }}
        </p>

        <form class="login-form" @submit.prevent="submit">
          <label class="field">
            <span class="field-label">邮箱</span>
            <a-input
              v-model:value="email"
              size="large"
              placeholder="请输入邮箱"
              autocomplete="email"
              data-testid="login-email"
            >
              <template #prefix><MailOutlined class="field-icon" /></template>
            </a-input>
          </label>

          <label class="field">
            <span class="field-label">验证码</span>
            <div class="code-row">
              <a-input
                v-model:value="code"
                size="large"
                placeholder="6 位数字验证码"
                :maxlength="6"
                autocomplete="one-time-code"
                data-testid="login-code"
              >
                <template #prefix><SafetyCertificateOutlined class="field-icon" /></template>
              </a-input>
              <button
                class="send-btn"
                type="button"
                :disabled="!canSend"
                data-testid="send-code"
                @click="sendCode"
              >
                {{ countdown > 0 ? `${countdown}s 后重发` : sending ? '发送中...' : '获取验证码' }}
              </button>
            </div>
          </label>

          <label v-if="mode === 'register'" class="field">
            <span class="field-label">
              用户名 ID
              <em class="field-tag">用于添加好友</em>
            </span>
            <a-input
              v-model:value="username"
              size="large"
              placeholder="例如：redstar_2026 或 红星读者"
              :maxlength="20"
              data-testid="register-username"
            >
              <template #prefix><IdcardOutlined class="field-icon" /></template>
            </a-input>
            <span class="field-hint">4–20 位中文、字母、数字或下划线，注册后不可修改</span>
            <span v-if="usernameError" class="field-error">不能包含空格或特殊符号，且至少 4 个字符</span>
          </label>

          <p v-if="devCode" class="dev-code" data-testid="dev-code">
            本地开发模式验证码：<strong>{{ devCode }}</strong>
          </p>

          <p v-if="error" class="login-error" data-testid="login-error">{{ error }}</p>

          <button class="login-btn" type="submit" :disabled="!canSubmit" data-testid="auth-submit">
            <UserAddOutlined v-if="mode === 'register'" />
            <LockOutlined v-else />
            {{ submitting ? (mode === 'login' ? '登录中...' : '注册中...') : mode === 'login' ? '登 录' : '注册并进入赤光社' }}
          </button>
        </form>

        <div class="login-note">
          <span class="note-line"></span>
          <p>{{ mode === 'login' ? '邮箱仅用于登录与身份识别，不会公开展示' : '注册后系统会生成唯一 6 位社区号，可用于数据库查询' }}</p>
          <span class="note-line"></span>
        </div>
      </section>

      <footer class="login-footer">赤光社 RedLight · 文献共享 · 思想交流 · 同好社群</footer>
    </main>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at 18% 16%, rgba(212, 175, 55, 0.08), transparent 34%),
    radial-gradient(circle at 82% 78%, rgba(200, 16, 46, 0.05), transparent 36%),
    #faf8f5;
}

.bg-decor {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.09;
}

.decor {
  position: absolute;
}

.gear {
  top: 8%;
  left: 4%;
  width: 220px;
  transform: rotate(-12deg);
}

.flag {
  right: 5%;
  bottom: 8%;
  width: 300px;
}

.wheat {
  left: 8%;
  bottom: 5%;
  width: 150px;
}

.gate {
  bottom: 2%;
  left: 50%;
  width: 460px;
  transform: translateX(-50%);
}

.decor-star {
  position: absolute;
  top: 12%;
  right: 10%;
  color: #c8102e;
  font-size: 120px;
  line-height: 1;
}

.login-main {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  min-height: 100vh;
  max-width: 460px;
  margin: 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px 28px;
}

.login-hero {
  margin-bottom: 24px;
  text-align: center;
}

.hero-star {
  color: #d4af37;
  font-size: 26px;
}

.hero-title {
  margin: 2px 0 0;
  color: #8b0000;
  font-family: var(--rl-serif);
  font-size: 40px;
  font-weight: 700;
  letter-spacing: 10px;
  text-indent: 10px;
}

.hero-en {
  margin: 0;
  color: #b49a62;
  font-size: 10px;
  letter-spacing: 5px;
}

.hero-slogan {
  margin-top: 10px;
  color: var(--rl-text-tertiary);
  font-family: var(--rl-serif);
  font-size: 14px;
  letter-spacing: 2px;
}

.login-card {
  width: 100%;
  padding: 28px 30px 24px;
  border-top: 3px solid var(--rl-primary);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 32px rgba(80, 40, 20, 0.1);
}

.auth-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-bottom: 18px;
  padding: 4px;
  border-radius: 8px;
  background: #fbf9f5;
  border: 1px solid var(--rl-border);
}

.auth-tab {
  height: 34px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--rl-text-secondary);
  font-family: var(--rl-sans);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.auth-tab:hover {
  color: var(--rl-primary);
}

.auth-tab.active {
  background: #fff;
  color: var(--rl-primary);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(80, 40, 20, 0.08);
}

.card-title {
  margin: 0;
  color: var(--rl-text);
  font-family: var(--rl-serif);
  font-size: 21px;
  letter-spacing: 2px;
}

.card-subtitle {
  margin: 4px 0 20px;
  color: var(--rl-text-secondary);
  font-size: 12px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.field-tag {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 3px;
  background: #fff1f0;
  color: var(--rl-primary);
  font-size: 10px;
  font-style: normal;
  font-weight: 400;
  line-height: 17px;
}

.field-hint {
  display: block;
  margin-top: 4px;
  color: var(--rl-text-secondary);
  font-size: 11px;
  line-height: 1.6;
}

.field-error {
  display: block;
  margin-top: 3px;
  color: var(--rl-primary);
  font-size: 11px;
}

.field-icon {
  color: #c2b39a;
}

.login-form :deep(.ant-input-affix-wrapper) {
  border-color: var(--rl-border);
  background: #fbf9f5;
}

.login-form :deep(.ant-input-affix-wrapper-focused) {
  border-color: var(--rl-primary);
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.08);
}

.code-row {
  display: flex;
  gap: 8px;
}

.code-row :deep(.ant-input-affix-wrapper) {
  flex: 1;
}

.send-btn {
  flex: 0 0 124px;
  height: 40px;
  padding: 0 8px;
  border: 1px solid var(--rl-primary);
  border-radius: 6px;
  background: #fff;
  color: var(--rl-primary);
  font-size: 13px;
  cursor: pointer;
}

.send-btn:hover:not(:disabled) {
  background: #fff1f0;
}

.send-btn:disabled {
  border-color: #e6dccd;
  color: #b9aa93;
  cursor: not-allowed;
}

.dev-code {
  margin: -4px 0 0;
  padding: 7px 10px;
  border-radius: 4px;
  background: #fdf6e8;
  color: #8a6a25;
  font-size: 12px;
}

.dev-code strong {
  color: var(--rl-primary);
  font-size: 14px;
  letter-spacing: 2px;
}

.login-error {
  margin: 0;
  color: var(--rl-primary);
  font-size: 12px;
}

.login-btn {
  display: flex;
  height: 42px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 2px;
  border: 1px solid var(--rl-primary);
  border-radius: 6px;
  background: var(--rl-primary);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 4px;
  cursor: pointer;
  transition: background 0.18s ease;
}

.login-btn:hover:not(:disabled) {
  background: var(--rl-primary-hover);
}

.login-btn:disabled {
  border-color: #e6dccd;
  background: #e6dccd;
  cursor: not-allowed;
}

.login-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  color: var(--rl-text-secondary);
  font-size: 11px;
  text-align: center;
}

.login-note p {
  flex: 0 0 auto;
}

.note-line {
  width: 100%;
  height: 1px;
  background: var(--rl-border);
}

.login-footer {
  margin-top: 18px;
  color: #b3a489;
  font-family: var(--rl-serif);
  font-size: 11px;
  letter-spacing: 1px;
  text-align: center;
}

@media (max-width: 480px) {
  .login-card {
    padding: 22px 20px 20px;
  }

  .hero-title {
    font-size: 34px;
  }

  .hero-slogan {
    font-size: 12px;
  }
}
</style>
