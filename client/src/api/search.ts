import { http } from './http';
import type { Book, Paged, SearchOverview, User } from '@/types';

export async function apiSearchAll(q: string): Promise<SearchOverview> {
  const { data } = await http.get<SearchOverview>('/api/search', { params: { q } });
  return data;
}

export async function apiSearchBooks(q: string, page = 1, size = 20, category = ''): Promise<Paged<Book>> {
  const { data } = await http.get<Paged<Book>>('/api/search/books', { params: { q, page, size, category } });
  return data;
}

export async function apiSearchUsers(q: string, page = 1, size = 20): Promise<Paged<User>> {
  const { data } = await http.get<Paged<User>>('/api/search/users', { params: { q, page, size } });
  return data;
}
