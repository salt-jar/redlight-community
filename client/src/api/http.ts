import axios, { type AxiosProgressEvent } from 'axios';

export const TOKEN_KEY = 'redlight_token';
export const USER_KEY = 'redlight_user';

export const http = axios.create({
  baseURL: '',
  timeout: 30000,
});

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

export function clearAuthStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || '');
    const msg = String(error?.response?.data?.msg || '');
    if (
      status === 401 &&
      !url.includes('/api/auth/login') &&
      !url.includes('/api/auth/send-code')
    ) {
      clearAuthStorage();
      unauthorizedHandler?.();
    }
    // 账号被封锁：立即清理登录态并回到登录页，而不是继续使用旧页面
    if (status === 403 && /封禁/.test(msg)) {
      clearAuthStorage();
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(error: unknown): string {
  const axiosError = error as { response?: { data?: { msg?: string } }; message?: string };
  return axiosError?.response?.data?.msg || axiosError?.message || '网络异常，请稍后重试';
}

export type { AxiosProgressEvent };
