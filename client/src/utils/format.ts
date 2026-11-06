/** 数字格式化：超过 9999 显示为“万” */
export function formatCount(value: number | string | null | undefined): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '0';
  if (number > 9999) {
    const wan = number / 10000;
    const text = wan >= 10 ? wan.toFixed(0) : wan.toFixed(1);
    return `${text.replace(/\.0$/, '')}万`;
  }
  return String(Math.floor(number));
}

/** 社区统计数字：千分位 */
export function formatStat(value: number | string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return Math.floor(number).toLocaleString('zh-CN');
}

/** 相对时间：刚刚 / n分钟前 / n小时前 / n天前 / 日期 */
export function timeAgo(input: string | number | Date | null | undefined, now = Date.now()): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return '';
  const diff = Math.max(0, now - timestamp);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return formatDate(date);
}

export function formatDate(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 聊天时间：今天显示 HH:mm，否则 MM-DD HH:mm */
export function formatChatTime(input: string | number | Date, now = new Date()): string {
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return `${hours}:${minutes}`;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1).replace(/\.0$/, '')} ${units[index]}`;
}
