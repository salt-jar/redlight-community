import axios from 'axios';
import type { Book, User } from '@/types';

export const ADMIN_TOKEN_KEY = 'redlight_admin_token';
export const ADMIN_SESSION_KEY = 'redlight_admin_session';

export interface AdminStore {
  id: number;
  name: string;
}

export interface AdminIdentity {
  id: number;
  username: string;
  displayName: string;
  storeId: number;
}

export interface AdminSession {
  token: string;
  admin: AdminIdentity;
  store: AdminStore;
}

export interface ReportTargetAuthor {
  id: number;
  nickname: string;
  username: string;
  communityNo: string;
  status: number;
}

export interface AdminReportTarget {
  kind: 'post' | 'book';
  id: number;
  title: string;
  status: number;
  createdAt: string;
  content?: string;
  author?: ReportTargetAuthor;
  uploader?: ReportTargetAuthor;
}

export interface AdminReport {
  id: number;
  targetType: 'post' | 'book';
  targetId: number;
  reason: string;
  detail: string;
  status: number;
  action: string;
  reporter: { id: number; nickname: string; username: string; communityNo: string };
  createdAt: string;
  handledAt: string | null;
  target: AdminReportTarget | null;
}

export interface AdminPost {
  id: number;
  content: string;
  status: number;
  createdAt: string;
  author: ReportTargetAuthor;
}

export interface AdminBook extends Omit<Book, 'uploader'> {
  status: number;
  uploader: ReportTargetAuthor;
}

export interface AdminUser extends User {
  email: string;
  status: number;
}

export interface AdminStats {
  pendingReports: number;
  posts: number;
  books: number;
  blockedUsers: number;
  users: number;
}

export interface Paged<T> {
  list: T[];
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
}

const adminHttp = axios.create({
  baseURL: '',
  timeout: 30000,
});

export function getAdminToken(): string {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

export function getAdminSession(): AdminSession | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    return raw ? (JSON.parse(raw) as AdminSession) : null;
  } catch {
    return null;
  }
}

export function saveAdminSession(session: AdminSession) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, session.token);
  sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ admin: session.admin, store: session.store }));
}

export function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

adminHttp.interceptors.request.use((config) => {
  const token = getAdminToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

adminHttp.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) clearAdminSession();
    return Promise.reject(error);
  },
);

export async function apiAdminStore(storeId: number): Promise<{ store: AdminStore }> {
  const { data } = await adminHttp.get(`/api/admin/stores/${storeId}/public`);
  return data;
}

export async function apiAdminGate(storeId: number, password: string) {
  const { data } = await adminHttp.post<{
    gateToken: string;
    expiresIn: number;
    store: AdminStore;
  }>('/api/admin/gate', { storeId, password });
  return data;
}

export async function apiAdminLogin(storeId: number, gateToken: string, username: string, password: string): Promise<AdminSession> {
  const { data } = await adminHttp.post<AdminSession>('/api/admin/login', {
    storeId,
    gateToken,
    username,
    password,
  });
  return data;
}

export async function apiAdminMe(): Promise<{ admin: AdminIdentity; store: AdminStore }> {
  const { data } = await adminHttp.get('/api/admin/me');
  return data;
}

export async function apiAdminStats(): Promise<AdminStats> {
  const { data } = await adminHttp.get<AdminStats>('/api/admin/stats');
  return data;
}

export async function apiAdminReports(params: { page?: number; size?: number; status?: number | 'all' }) {
  const { data } = await adminHttp.get<Paged<AdminReport>>('/api/admin/reports', { params });
  return data;
}

export async function apiAdminReportAction(id: number, action: 'dismiss' | 'remove_post' | 'remove_book' | 'block_user') {
  const { data } = await adminHttp.post(`/api/admin/reports/${id}/action`, { action });
  return data;
}

export async function apiAdminPosts(params: { page?: number; size?: number; q?: string }) {
  const { data } = await adminHttp.get<Paged<AdminPost>>('/api/admin/posts', { params });
  return data;
}

export async function apiAdminSetPostStatus(id: number, status: number) {
  const { data } = await adminHttp.post(`/api/admin/posts/${id}/status`, { status });
  return data;
}

export async function apiAdminBooks(params: { page?: number; size?: number; q?: string }) {
  const { data } = await adminHttp.get<Paged<AdminBook>>('/api/admin/books', { params });
  return data;
}

export async function apiAdminSetBookStatus(id: number, status: number) {
  const { data } = await adminHttp.post(`/api/admin/books/${id}/status`, { status });
  return data;
}

export async function apiAdminUsers(params: { page?: number; size?: number; q?: string }) {
  const { data } = await adminHttp.get<Paged<AdminUser>>('/api/admin/users', { params });
  return data;
}

export async function apiAdminSetUserStatus(id: number, status: number) {
  const { data } = await adminHttp.post(`/api/admin/users/${id}/status`, { status });
  return data;
}
