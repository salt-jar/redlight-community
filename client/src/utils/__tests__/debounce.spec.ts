import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('300ms 内仅执行最后一次调用', () => {
    const spy = vi.fn();
    const fn = debounce(spy, 300);
    fn('a');
    vi.advanceTimersByTime(299);
    fn('b');
    vi.advanceTimersByTime(299);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('b');
  });

  it('cancel 可取消未执行的调用', () => {
    const spy = vi.fn();
    const fn = debounce(spy, 300);
    fn('x');
    fn.cancel();
    vi.advanceTimersByTime(500);
    expect(spy).not.toHaveBeenCalled();
  });
});
