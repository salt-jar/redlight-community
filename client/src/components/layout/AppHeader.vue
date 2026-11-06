<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { EditOutlined, UploadOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import GlobalSearch from './GlobalSearch.vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();

const nickname = computed(() => auth.user?.nickname || '同志');

function openComposer() {
  ui.openComposer();
  if (router.currentRoute.value.path !== '/') void router.push('/');
}

function goUpload() {
  void router.push('/upload');
}

function onMenuClick(info: { key: string | number }) {
  const key = String(info.key);
  if (key === 'profile') {
    if (auth.user) void router.push(`/profile/${auth.user.id}`);
  } else if (key === 'upload') {
    goUpload();
  } else if (key === 'logout') {
    auth.logout();
    message.success('已退出登录');
    void router.replace('/login');
  }
}
</script>

<template>
  <header class="app-header" data-testid="app-header">
    <div class="header-inner">
      <router-link to="/" class="brand" aria-label="赤光社首页">
        <svg class="brand-star" width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
          <path
            d="M16 2.5l3.6 8.6 9.3.8-7.1 6.1 2.2 9.1L16 22.3l-8 4.8 2.2-9.1-7.1-6.1 9.3-.8z"
            fill="#D4AF37"
          />
          <circle cx="16" cy="13.5" r="2" fill="#C8102E" />
        </svg>
        <span class="brand-name">赤光社</span>
        <span class="brand-en">RedLight</span>
      </router-link>

      <div class="header-search">
        <GlobalSearch />
      </div>

      <div class="header-actions">
        <button class="compose-btn" type="button" data-testid="header-compose" @click="openComposer">
          <EditOutlined />
          <span class="btn-label">发帖</span>
        </button>
        <button class="upload-btn" type="button" data-testid="header-upload" @click="goUpload">
          <UploadOutlined />
          <span class="btn-label">上传</span>
        </button>

        <a-dropdown placement="bottomRight" :trigger="['click']">
          <button class="avatar-btn" type="button" data-testid="header-avatar" :title="nickname">
            <UserAvatar :user="auth.user" :size="32" />
          </button>
          <template #overlay>
            <a-menu class="header-menu" @click="onMenuClick">
              <div class="menu-user">
                <strong>{{ nickname }}</strong>
                <span>{{ auth.user?.email || '赤光社同志' }}</span>
              </div>
              <a-menu-divider />
              <a-menu-item key="profile">个人主页</a-menu-item>
              <a-menu-item key="upload">上传图书</a-menu-item>
              <a-menu-divider />
              <a-menu-item key="logout" danger>退出登录</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  height: 56px;
  background-color: #c8102e;
  background-image: linear-gradient(90deg, #b20d28 0%, #c8102e 55%, #bb0e2a 100%);
  color: #fff;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.08);
}

.header-inner {
  display: flex;
  align-items: center;
  gap: 18px;
  max-width: 1224px;
  height: 100%;
  margin: 0 auto;
  padding: 0 16px;
}

.brand {
  display: flex;
  flex: 0 0 182px;
  align-items: center;
  gap: 7px;
  color: #fff;
}

.brand-star {
  flex: 0 0 auto;
}

.brand-name {
  font-family: var(--rl-serif);
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 2px;
  white-space: nowrap;
}

.brand-en {
  margin-top: 3px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
  white-space: nowrap;
}

.header-search {
  flex: 1;
  max-width: 420px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.compose-btn,
.upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--rl-radius-btn);
  font-family: var(--rl-sans);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.compose-btn {
  border: 1px solid #d4af37;
  background: #d4af37;
  color: #8b0000;
  font-weight: 600;
}

.compose-btn:hover {
  background: #e3c35a;
  border-color: #e3c35a;
}

.upload-btn {
  border: 1px solid rgba(255, 255, 255, 0.62);
  background: transparent;
  color: #fff;
}

.upload-btn:hover {
  border-color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.12);
}

.avatar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}

.avatar-btn:hover {
  border-color: #d4af37;
}

.menu-user {
  display: flex;
  min-width: 180px;
  flex-direction: column;
  padding: 8px 12px 4px;
}

.menu-user strong {
  color: var(--rl-text);
  font-size: 14px;
}

.menu-user span {
  color: var(--rl-text-secondary);
  font-size: 12px;
}

@media (max-width: 1199px) {
  .brand {
    flex-basis: 72px;
  }

  .brand-en {
    display: none;
  }

  .brand-name {
    font-size: 19px;
    letter-spacing: 1px;
  }
}

@media (max-width: 767px) {
  .header-inner {
    gap: 10px;
    padding: 0 12px;
  }

  .brand {
    flex-basis: auto;
  }

  .brand-name {
    font-size: 18px;
  }

  .brand-star {
    width: 24px;
    height: 24px;
  }

  .header-search {
    display: none;
  }

  .compose-btn .btn-label,
  .upload-btn .btn-label {
    display: none;
  }

  .compose-btn,
  .upload-btn {
    width: 34px;
    padding: 0;
    justify-content: center;
  }
}
</style>
