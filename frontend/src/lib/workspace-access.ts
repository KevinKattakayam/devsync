import api from './api';
import type { Workspace, WorkspaceMember } from '@/types';

export type MemberRole = WorkspaceMember['role'];
export interface PendingInvitation {
  id: string;
  email: string;
  role: 'EDITOR' | 'VIEWER';
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}
export async function loadWorkspaceAccess(workspaceId: string) {
  const [workspace, actor] = await Promise.all([
    api.get<Workspace>(`/workspaces/${workspaceId}`),
    api.get<{ id: string }>('/auth/me'),
  ]);
  const member = workspace.data.members.find((item) => item.user.id === actor.data.id);
  if (!member) throw new Error('Workspace access unavailable');
  return { workspace: workspace.data, actorId: actor.data.id, role: member.role };
}
export const workspaceAccess = {
  updateRole: async (workspaceId: string, memberId: string, role: MemberRole) =>
    (await api.patch<WorkspaceMember>(`/workspaces/${workspaceId}/members/${memberId}`, { role }))
      .data,
  remove: async (workspaceId: string, memberId: string) => {
    await api.delete(`/workspaces/${workspaceId}/members/${memberId}`);
  },
  invite: async (
    workspaceId: string,
    email: string,
    role: PendingInvitation['role'],
    receipt: string,
  ) =>
    (
      await api.post<PendingInvitation>(
        `/workspaces/${workspaceId}/invitations`,
        { email, role },
        { headers: { 'Idempotency-Key': receipt } },
      )
    ).data,
  revoke: async (workspaceId: string, invitationId: string) => {
    await api.delete(`/workspaces/${workspaceId}/invitations/${invitationId}`);
  },
};
