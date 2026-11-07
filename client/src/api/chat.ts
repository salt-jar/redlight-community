import { http } from './http';
import type { ChatHistory, ChatGroup, OnlineSnapshot } from '@/types';

export async function apiChatGroups(): Promise<ChatGroup[]> {
  const { data } = await http.get<{ list: ChatGroup[] }>('/api/chat/groups');
  return data.list;
}

export async function apiChatHistory(beforeId?: number, limit = 50, groupId = 1): Promise<ChatHistory> {
  const { data } = await http.get<ChatHistory>('/api/chat/history', {
    params: beforeId ? { beforeId, limit, groupId } : { limit, groupId },
  });
  return data;
}

export async function apiOnline(): Promise<OnlineSnapshot> {
  const { data } = await http.get<OnlineSnapshot>('/api/stats/online');
  return data;
}
