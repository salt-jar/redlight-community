import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const apiMock = vi.hoisted(() => ({
  apiSendCode: vi.fn(),
  apiLogin: vi.fn(),
  apiMe: vi.fn(),
}));

vi.mock('@/api/auth', () => ({
  apiSendCode: apiMock.apiSendCode,
  apiLogin: apiMock.apiLogin,
  apiMe: apiMock.apiMe,
}));

import { useAuthStore } from '@/stores/auth';
import { TOKEN_KEY, USER_KEY } from '@/api/http';

const user = {
  id: 7,
  email: 'reader@example.com',
  nickname: '同志_reader',
  avatarUrl: '',
  bio: '',
  role: 0,
  createdAt: '2026-11-06T00:00:00Z',
};

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('登录后持久化 token 与用户信息', async () => {
    apiMock.apiLogin.mockResolvedValue({ token: 'jwt-token', user });
    const store = useAuthStore();
    expect(store.isLoggedIn).toBe(false);

    await store.login('reader@example.com', '123456');
    expect(store.token).toBe('jwt-token');
    expect(store.user?.nickname).toBe('同志_reader');
    expect(store.isLoggedIn).toBe(true);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-token');
    expect(JSON.parse(localStorage.getItem(USER_KEY) || '{}').id).toBe(7);
  });

  it('退出登录清理 token、用户与 localStorage', async () => {
    apiMock.apiLogin.mockResolvedValue({ token: 'jwt-token', user });
    const store = useAuthStore();
    await store.login('reader@example.com', '123456');
    store.logout();
    expect(store.isLoggedIn).toBe(false);
    expect(store.user).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });

  it('fetchMe 刷新资料；无 token 时直接返回 null', async () => {
    const store = useAuthStore();
    expect(await store.fetchMe()).toBeNull();
    expect(apiMock.apiMe).not.toHaveBeenCalled();

    apiMock.apiLogin.mockResolvedValue({ token: 'jwt-token', user });
    await store.login('reader@example.com', '123456');
    apiMock.apiMe.mockResolvedValue({ ...user, nickname: '新昵称' });
    const me = await store.fetchMe();
    expect(me?.nickname).toBe('新昵称');
    expect(store.user?.nickname).toBe('新昵称');
  });
});
