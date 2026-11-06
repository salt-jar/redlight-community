export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(String(email).trim());
}

export function countChars(text: string): number {
  return Array.from(String(text || '')).length;
}
