import { http } from './http';
import type { User } from '@/types';

export interface SendCodeResult {
  success: boolean;
  purpose: 'login' | 'register';
  expiresIn: number;
  cooldown: number;
  devCode?: string;
}

export async function apiSendCode(email: string, purpose: 'login' | 'register' = 'login'): Promise<SendCodeResult> {
  const { data } = await http.post<SendCodeResult>('/api/auth/send-code', { email, purpose });
  return data;
}

export async function apiRegister(payload: {
  email: string;
  code: string;
  username: string;
}): Promise<{ token: string; user: User }> {
  const { data } = await http.post<{ token: string; user: User }>('/api/auth/register', payload);
  return data;
}

export async function apiLogin(email: string, code: string): Promise<{ token: string; user: User }> {
  const { data } = await http.post<{ token: string; user: User }>('/api/auth/login', { email, code });
  return data;
}

export async function apiMe(): Promise<User> {
  const { data } = await http.get<{ user: User }>('/api/auth/me');
  return data.user;
}
