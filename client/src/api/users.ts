import { http } from './http';
import type { ProfileResponse, User } from '@/types';

export async function apiGetProfile(id: number, page = 1, size = 10): Promise<ProfileResponse> {
  const { data } = await http.get<ProfileResponse>(`/api/users/${id}`, { params: { page, size } });
  return data;
}

export interface UpdateProfilePayload {
  nickname?: string;
  avatarUrl?: string;
}

export async function apiUpdateProfile(payload: UpdateProfilePayload): Promise<User> {
  const { data } = await http.patch<{ user: User }>('/api/users/me', payload);
  return data.user;
}
