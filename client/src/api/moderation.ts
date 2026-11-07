import { http } from './http';

export async function apiModeratePost(id: number, status: number) {
  const { data } = await http.post(`/api/moderation/posts/${id}/status`, { status });
  return data;
}

export async function apiModerateBook(id: number, status: number) {
  const { data } = await http.post(`/api/moderation/books/${id}/status`, { status });
  return data;
}

export async function apiModerateUser(id: number, status: number) {
  const { data } = await http.post(`/api/moderation/users/${id}/status`, { status });
  return data;
}
