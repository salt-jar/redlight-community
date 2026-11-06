import { http, type AxiosProgressEvent } from './http';
import type { Book, Paged } from '@/types';

export interface BookQuery {
  page?: number;
  size?: number;
  category?: string;
}

export async function apiGetBooks(params: BookQuery = {}): Promise<Paged<Book>> {
  const { data } = await http.get<Paged<Book>>('/api/books', { params });
  return data;
}

export async function apiGetBook(id: number): Promise<Book> {
  const { data } = await http.get<{ book: Book }>(`/api/books/${id}`);
  return data.book;
}

export interface UploadBookPayload {
  title: string;
  author: string;
  category: string;
  description: string;
  zipFile: File;
}

export async function apiUploadBook(
  payload: UploadBookPayload,
  onProgress?: (event: AxiosProgressEvent) => void,
): Promise<Book> {
  const form = new FormData();
  form.append('title', payload.title);
  form.append('author', payload.author);
  form.append('category', payload.category);
  form.append('description', payload.description);
  form.append('zipFile', payload.zipFile);
  const { data } = await http.post<{ book: Book; success: boolean; msg: string }>('/api/books/upload', form, {
    timeout: 300000,
    onUploadProgress: onProgress,
  });
  return data.book;
}

export function bookFileUrl(id: number): string {
  return `/api/books/${id}/file`;
}

export function bookDownloadUrl(id: number): string {
  return `/api/books/${id}/download`;
}
