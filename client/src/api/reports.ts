import { http } from './http';

export const REPORT_REASONS = ['违法违规', '色情低俗', '侵权盗版', '垃圾广告', '人身攻击', '其他'] as const;

export type ReportTargetType = 'post' | 'book';

export async function apiCreateReport(payload: {
  targetType: ReportTargetType;
  targetId: number;
  reason: string;
  detail?: string;
}) {
  const { data } = await http.post<{ success: boolean; id: number; msg: string }>('/api/reports', payload);
  return data;
}
