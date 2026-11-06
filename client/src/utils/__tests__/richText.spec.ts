import { describe, expect, it } from 'vitest';
import { escapeHtml, extractTopics, renderRichText } from '../richText';

describe('帖子富文本渲染', () => {
  it('先转义 HTML，防止 XSS', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    const html = renderRichText('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('高亮 #话题# 与 @同志，并保留换行', () => {
    const html = renderRichText('重读 #共产党宣言# ，@列宁 同志怎么看？\n第二行');
    expect(html).toContain('<span class="topic-link">#共产党宣言#</span>');
    expect(html).toContain('<span class="mention-link">@列宁</span>');
    expect(html).toContain('<br />');
    expect(html).not.toContain('\n');
  });

  it('提取话题', () => {
    expect(extractTopics('学习 #马列原著# 与 #资本论# 的一天')).toEqual(['马列原著', '资本论']);
    expect(extractTopics('没有话题')).toEqual([]);
  });
});
