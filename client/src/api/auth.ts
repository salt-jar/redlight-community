import { http } from './http';
import type { User } from '@/types';

export interface SendCodeResult {
  success: boolean;
  expiresIn: number;
  cooldown: number;
  devCode?: string;
}

export async function apiSendCode(email: string): Promise<SendCodeResult> {
  const { data } = await http.post<SendCodeResult>('/api/auth/send-code', { email });
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
