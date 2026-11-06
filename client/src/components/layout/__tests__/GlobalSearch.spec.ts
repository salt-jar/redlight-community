import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick } from 'vue';

const pushMock = vi.hoisted(() => vi.fn());
const searchMock = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({ name: 'home', query: {}, fullPath: '/' }),
}));
vi.mock('@/api/search', () => ({
  apiSearchAll: searchMock,
  apiSearchBooks: vi.fn(),
  apiSearchUsers: vi.fn(),
}));

import GlobalSearch from '../GlobalSearch.vue';

const AInputStub = defineComponent({
  name: 'AInput',
  props: { value: { type: String, default: '' } },
  emits: ['update:value', 'input', 'pressEnter', 'focus'],
  template: `<input
    class="fake-input"
    :value="value"
    @input="$emit('update:value', $event.target.value); $emit('input')"
    @keydown.enter="$emit('pressEnter')"
    @focus="$emit('focus')"
  />`,
});

const book = {
  id: 1,
  title: '共产党宣言',
  author: '马克思 恩格斯',
  coverUrl: '/uploads/images/cover.png',
  fileFormat: 'pdf',
  category: '马恩著作',
  description: '',
  uploaderId: 1,
  fileSize: 1,
  downloadCount: 0,
  status: 1,
  createdAt: '2026-11-06T00:00:00Z',
};

describe('GlobalSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    searchMock.mockResolvedValue({ books: [book], users: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function mountSearch() {
    return mount(GlobalSearch, {
      global: {
        stubs: {
          'a-input': AInputStub,
          SearchOutlined: true,
        },
      },
    });
  }

  it('输入后 300ms 防抖才发起搜索并展示分组结果', async () => {
    const wrapper = mountSearch();
    const input = wrapper.find('input');
    await input.setValue('共产党');
    await nextTick();

    vi.advanceTimersByTime(299);
    expect(searchMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock).toHaveBeenCalledWith('共产党');
    expect(wrapper.text()).toContain('共产党宣言');
    expect(wrapper.text()).toContain('图书结果');
    expect(wrapper.text()).toContain('回车查看全部结果');
  });

  it('回车进入搜索结果页', async () => {
    const wrapper = mountSearch();
    await wrapper.find('input').setValue('资本论');
    await nextTick();
    vi.advanceTimersByTime(300);
    await flushPromises();

    await wrapper.find('input').trigger('keydown.enter');
    expect(pushMock).toHaveBeenCalledWith({ path: '/search', query: { q: '资本论' } });
  });

  it('空关键词不请求接口', async () => {
    const wrapper = mountSearch();
    await wrapper.find('input').setValue('   ');
    await nextTick();
    vi.advanceTimersByTime(400);
    await flushPromises();
    expect(searchMock).not.toHaveBeenCalled();
  });
});
