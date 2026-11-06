import { http } from './http';
import type { ProfileResponse } from '@/types';

export async function apiGetProfile(id: number, page = 1, size = 10): Promise<ProfileResponse> {
  const { data } = await http.get<ProfileResponse>(`/api/users/${id}`, { params: { page, size } });
  return data;
}
