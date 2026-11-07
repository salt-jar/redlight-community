import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  apiLikePost: vi.fn(),
  apiRepost: vi.fn(),
  apiGetComments: vi.fn().mockResolvedValue([]),
  apiCreateComment: vi.fn(),
}));
const pushMock = vi.hoisted(() => vi.fn());

vi.mock('@/api/posts', () => apiMock);
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import PostCard from '../PostCard.vue';
import type { Post } from '@/types';

const basePost: Post = {
  id: 1,
  content: '重读 #共产党宣言# ，@列宁 同志怎么看？',
  images: [],
  repostId: null,
  likeCount: 0,
  commentCount: 0,
  liked: false,
  createdAt: '2026-11-06T00:00:00Z',
  user: { id: 2, nickname: '马克思的小胡子', avatarUrl: '', bio: '资本论读者' },
  repost: null,
};

function mountCard(overrides: Partial<Post> = {}) {
  return mount(PostCard, {
    props: { post: { ...basePost, ...overrides } },
    global: {
      plugins: [createPinia()],
      stubs: {
        UserAvatar: true,
        PostImageGrid: true,
        CommentList: {
          name: 'CommentList',
          props: ['postId'],
          template: '<div class="comment-list-stub">评论列表</div>',
        },
        'a-dropdown': true,
        'a-menu': true,
        'a-menu-item': true,
        'a-modal': true,
        'a-textarea': true,
        'a-button': true,
      },
    },
  });
}

describe('PostCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('渲染作者、正文富文本、简介与时间', () => {
    const wrapper = mountCard();
    expect(wrapper.find('.author-name').text()).toBe('马克思的小胡子');
    expect(wrapper.find('.author-bio').text()).toBe('资本论读者');
    expect(wrapper.find('.post-content').html()).toContain('class="topic-link"');
    expect(wrapper.html()).toContain('@列宁');
    expect(wrapper.find('.post-time').text()).toBeTruthy();
  });

  it('点赞乐观更新并以后端计数为准', async () => {
    apiMock.apiLikePost.mockResolvedValue({ liked: true, likeCount: 1 });
    const wrapper = mountCard();
    await wrapper.find('[data-testid="like-button"]').trigger('click');

    expect(apiMock.apiLikePost).toHaveBeenCalledWith(1);
    expect(wrapper.find('[data-testid="like-button"]').classes()).toContain('active');
    expect(wrapper.find('[data-testid="like-button"]').text()).toContain('1');
  });

  it('点赞数超过 9999 显示为万', () => {
    const wrapper = mountCard({ likeCount: 12345, liked: true });
    expect(wrapper.find('[data-testid="like-button"]').text()).toContain('1.2万');
  });

  it('评论区在卡片内展开', async () => {
    const wrapper = mountCard();
    expect(wrapper.find('.comment-list-stub').exists()).toBe(false);
    await wrapper.find('[data-testid="comment-button"]').trigger('click');
    expect(wrapper.find('.comment-list-stub').exists()).toBe(true);
  });

  it('转发帖展示原帖引用块', () => {
    const wrapper = mountCard({
      content: '转发学习',
      repostId: 9,
      repost: {
        id: 9,
        content: '原文内容',
        images: [],
        createdAt: '2026-11-05T00:00:00Z',
        user: { id: 3, nickname: '列宁的灯塔', avatarUrl: '' },
      },
    });
    expect(wrapper.find('.repost-quote').exists()).toBe(true);
    expect(wrapper.find('.quote-author').text()).toContain('列宁的灯塔');
    expect(wrapper.find('.quote-content').text()).toContain('原文内容');
  });

  it('点击作者跳转个人主页', async () => {
    const wrapper = mountCard();
    await wrapper.find('.author-name').trigger('click');
    expect(pushMock).toHaveBeenCalledWith('/profile/2');
  });
});
