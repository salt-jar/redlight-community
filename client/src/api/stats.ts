import { http } from './http';
import type { CommunityStats, HotTopic, OnlineSnapshot } from '@/types';

export async function apiHotTopics(): Promise<HotTopic[]> {
  const { data } = await http.get<{ list: HotTopic[] }>('/api/stats/hot-topics');
  return data.list;
}

export async function apiCommunityStats(): Promise<CommunityStats> {
  const { data } = await http.get<CommunityStats>('/api/stats/community');
  return data;
}

export async function apiOnlineSnapshot(): Promise<OnlineSnapshot> {
  const { data } = await http.get<OnlineSnapshot>('/api/stats/online');
  return data;
}
