export interface User {
  id: number;
  email?: string;
  nickname: string;
  username?: string;
  communityNo?: string;
  avatarUrl: string;
  bio: string;
  role?: number;
  isAdmin?: boolean;
  createdAt?: string;
}

export interface PostAuthor {
  id: number;
  nickname: string;
  avatarUrl: string;
  bio?: string;
  role?: number;
  isAdmin?: boolean;
}

export interface Repost {
  id: number;
  content: string;
  images: string[];
  createdAt: string;
  user: PostAuthor;
}

export interface Post {
  id: number;
  content: string;
  images: string[];
  repostId: number | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  createdAt: string;
  user: PostAuthor;
  repost: Repost | null;
}

export interface Comment {
  id: number;
  postId: number;
  content: string;
  createdAt: string;
  user: PostAuthor;
}

export interface Book {
  id: number;
  uploaderId: number;
  title: string;
  author: string;
  category: string;
  description: string;
  coverUrl: string;
  fileFormat: 'pdf' | 'epub' | string;
  fileSize: number;
  downloadCount: number;
  status: number;
  createdAt: string;
  uploader?: PostAuthor;
}

export interface ChatGroup {
  id: number;
  name: string;
  description: string;
  sortOrder: number;
}

export interface ChatMessage {
  id: number;
  groupId?: number;
  type: 1 | 2;
  content: string;
  createdAt: string;
  user: PostAuthor;
}

export interface Proposal {
  id: number;
  title: string;
  proposalTime: string;
  proposerInfo: string;
  content: string;
  createdAt: string;
  user: PostAuthor;
}

export interface OnlineSnapshot {
  count: number;
  users: PostAuthor[];
}

export interface HotTopic {
  topic: string;
  count: number;
}

export interface CommunityStats {
  users: number;
  todayNewUsers: number;
  todayPosts: number;
  books: number;
}

export interface Paged<T> {
  list: T[];
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
}

export interface SearchOverview {
  books: Book[];
  users: User[];
}

export interface ProfileResponse extends Paged<Post> {
  user: User;
  posts: Post[];
}

export interface ChatHistory {
  list: ChatMessage[];
  hasMore: boolean;
  limit: number;
}
