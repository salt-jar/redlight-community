import { http } from './http';
import type { ChatHistory, OnlineSnapshot } from '@/types';

export async function apiChatHistory(beforeId?: number, limit = 50): Promise<ChatHistory> {
  const { data } = await http.get<ChatHistory>('/api/chat/history', {
    params: beforeId ? { beforeId, limit } : { limit },
  });
  return data;
}

export async function apiOnline(): Promise<OnlineSnapshot> {
  const { data } = await http.get<OnlineSnapshot>('/api/stats/online');
  return data;
}

export interface AtAllUsage {
  limit: number;
  used: number;
  remaining: number;
  weekStart: string;
}

export async function apiChatAtAll(): Promise<AtAllUsage> {
  const { data } = await http.get<AtAllUsage>('/api/chat/at-all');
  return data;
}
