import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { apiLogin, apiMe, apiRegister, apiSendCode, type SendCodeResult } from '@/api/auth';
import { clearAuthStorage, TOKEN_KEY, USER_KEY } from '@/api/http';
import type { User } from '@/types';

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) || '');
  const user = ref<User | null>(readStoredUser());
  const isLoggedIn = computed(() => Boolean(token.value));
  const displayName = computed(() => user.value?.nickname || '同志');

  function persist() {
    if (token.value) localStorage.setItem(TOKEN_KEY, token.value);
    else localStorage.removeItem(TOKEN_KEY);
    if (user.value) localStorage.setItem(USER_KEY, JSON.stringify(user.value));
    else localStorage.removeItem(USER_KEY);
  }

  async function sendCode(email: string, purpose: 'login' | 'register' = 'login'): Promise<SendCodeResult> {
    return apiSendCode(email, purpose);
  }

  async function login(email: string, code: string) {
    const data = await apiLogin(email, code);
    token.value = data.token;
    user.value = data.user;
    persist();
    return data;
  }

  async function register(payload: { email: string; code: string; username: string }) {
    const data = await apiRegister(payload);
    token.value = data.token;
    user.value = data.user;
    persist();
    return data;
  }

  async function fetchMe(): Promise<User | null> {
    if (!token.value) return null;
    const me = await apiMe();
    user.value = me;
    persist();
    return me;
  }

  function setUser(next: User) {
    user.value = next;
    persist();
  }

  function logout() {
    token.value = '';
    user.value = null;
    clearAuthStorage();
  }

  return { token, user, isLoggedIn, displayName, sendCode, login, register, fetchMe, setUser, logout };
});
