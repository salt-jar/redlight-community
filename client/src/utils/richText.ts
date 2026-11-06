const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return String(text ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * 帖子正文富文本：先转义，再高亮 #话题# 与 @同志，最后保留换行。
 * 输出可直接用于 v-html，且不会引入用户输入的 HTML。
 */
export function renderRichText(text: string): string {
  return escapeHtml(text)
    .replace(/#([^#\s]{1,30})#/g, '<span class="topic-link">#$1#</span>')
    .replace(/@([A-Za-z0-9_\u4e00-\u9fa5-]{1,20})/g, '<span class="mention-link">@$1</span>')
    .replace(/\n/g, '<br />');
}

/** 从正文提取 #话题#，用于前端展示 */
export function extractTopics(text: string): string[] {
  const topics: string[] = [];
  const regex = /#([^#\s]{1,30})#/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(text || '')) !== null) topics.push(match[1]);
  return topics;
}
