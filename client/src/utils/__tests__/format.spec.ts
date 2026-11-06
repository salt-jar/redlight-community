import { describe, expect, it } from 'vitest';
import { formatCount, formatDate, formatFileSize, formatStat, timeAgo } from '../format';

describe('数字与时间格式化', () => {
  it('点赞数超过 9999 显示为万', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(9999)).toBe('9999');
    expect(formatCount(10000)).toBe('1万');
    expect(formatCount(12345)).toBe('1.2万');
    expect(formatCount(15000)).toBe('1.5万');
    expect(formatCount(100000)).toBe('10万');
  });

  it('社区统计使用千分位', () => {
    expect(formatStat(12580)).toBe('12,580');
    expect(formatStat(0)).toBe('0');
  });

  it('相对时间覆盖刚刚/分钟/小时/天/日期', () => {
    const now = new Date('2026-11-06T12:00:00+08:00').getTime();
    expect(timeAgo(now - 30 * 1000, now)).toBe('刚刚');
    expect(timeAgo(now - 5 * 60 * 1000, now)).toBe('5分钟前');
    expect(timeAgo(now - 2 * 60 * 60 * 1000, now)).toBe('2小时前');
    expect(timeAgo(now - 3 * 24 * 60 * 60 * 1000, now)).toBe('3天前');
    expect(timeAgo('2026-01-02T08:00:00+08:00', now)).toBe('2026-01-02');
    expect(timeAgo(now + 10_000, now)).toBe('刚刚');
    expect(timeAgo(null as unknown as string)).toBe('');
  });

  it('日期与文件大小格式化', () => {
    expect(formatDate('2026-11-06T09:00:00+08:00')).toBe('2026-11-06');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1024 * 1024 * 3.5)).toBe('3.5 MB');
    expect(formatFileSize(0)).toBe('0 B');
  });
});
