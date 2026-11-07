import { http } from './http';
import type { ChatMessage, Proposal, ProposalComment } from '@/types';

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

export async function apiProposalDetail(id: number): Promise<Proposal> {
  const { data } = await http.get<{ proposal: Proposal }>(`/api/proposals/${id}`);
  return data.proposal;
}

export async function apiProposalComments(id: number): Promise<ProposalComment[]> {
  const { data } = await http.get<{ list: ProposalComment[] }>(`/api/proposals/${id}/comments`);
  return data.list;
}

export async function apiCreateProposal(payload: ProposalPayload): Promise<Proposal> {
  const { data } = await http.post<{ proposal: Proposal }>('/api/proposals', payload);
  return data.proposal;
}

export async function apiVoteProposal(id: number): Promise<{ voted: boolean; voteCount: number }> {
  const { data } = await http.post<{ voted: boolean; voteCount: number }>(`/api/proposals/${id}/vote`);
  return data;
}

export async function apiCommentProposal(
  id: number,
  content: string,
  groupId: number,
): Promise<{ comment: ProposalComment; proposal: Proposal; message: ChatMessage }> {
  const { data } = await http.post<{ comment: ProposalComment; proposal: Proposal; message: ChatMessage }>(
    `/api/proposals/${id}/comments`,
    { content, groupId },
  );
  return data;
}
