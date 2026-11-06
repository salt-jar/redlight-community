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
