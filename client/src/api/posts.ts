import { http } from './http';
import type { Comment, Paged, Post } from '@/types';

export async function apiGetPosts(page = 1, size = 20): Promise<Paged<Post>> {
  const { data } = await http.get<Paged<Post>>('/api/posts', { params: { page, size } });
  return data;
}

export async function apiCreatePost(payload: { content: string; images?: string[] }): Promise<Post> {
  const { data } = await http.post<{ post: Post }>('/api/posts', payload);
  return data.post;
}

export async function apiLikePost(id: number): Promise<{ liked: boolean; likeCount: number }> {
  const { data } = await http.post<{ liked: boolean; likeCount: number }>(`/api/posts/${id}/like`);
  return data;
}

export async function apiGetComments(id: number): Promise<Comment[]> {
  const { data } = await http.get<{ list: Comment[] }>(`/api/posts/${id}/comments`);
  return data.list;
}

export async function apiCreateComment(id: number, content: string): Promise<{ comment: Comment; commentCount: number }> {
  const { data } = await http.post<{ comment: Comment; commentCount: number }>(`/api/posts/${id}/comments`, { content });
  return data;
}

export async function apiRepost(id: number, content: string): Promise<Post> {
  const { data } = await http.post<{ post: Post }>(`/api/posts/${id}/repost`, { content });
  return data.post;
}
