import { http } from './http';

export async function apiUploadImage(file: File): Promise<{ url: string; size: number }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await http.post<{ url: string; size: number }>('/api/upload/image', form);
  return data;
}
