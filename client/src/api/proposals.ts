import { http } from './http';
import type { Proposal } from '@/types';

export interface ProposalPayload {
  title: string;
  proposalTime: string;
  proposerInfo: string;
  content: string;
}

export async function apiProposals(limit = 50): Promise<Proposal[]> {
  const { data } = await http.get<{ list: Proposal[] }>('/api/proposals', { params: { limit } });
  return data.list;
}

export async function apiCreateProposal(payload: ProposalPayload): Promise<Proposal> {
  const { data } = await http.post<{ proposal: Proposal }>('/api/proposals', payload);
  return data.proposal;
}
