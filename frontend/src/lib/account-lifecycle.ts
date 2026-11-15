import api from './api';
import { z } from 'zod';
const base = () =>
  `${(api.defaults?.baseURL || '/api').replace(/\/v1\/?$/, '').replace(/\/$/, '')}/v2`;
export interface SessionSummary {
  id: string;
  current: boolean;
  createdAt: number;
  lastActiveAt: number;
}
export interface DeletionPlan {
  deletionAvailable: false;
  providerManaged: true;
  ownedWorkspaces: { id: string; name: string; activeOwners: number; requiresTransfer: boolean }[];
  steps: string[];
}
export interface ExportRequest {
  id: string;
  workspaceId: string;
  requestedBy: string;
  status: 'REVIEW_REQUIRED';
  createdAt: string;
}
export interface LifecyclePlan {
  workspaceName: string;
  retainedCrdtBackups: number;
  requests: ExportRequest[];
  deletionRequiresReview: true;
}
const exportSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    requestedBy: z.string(),
    status: z.literal('REVIEW_REQUIRED'),
    createdAt: z.string(),
  })
  .strict();
const planSchema = z
  .object({
    deletionAvailable: z.literal(false),
    providerManaged: z.literal(true),
    ownedWorkspaces: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        activeOwners: z.number(),
        requiresTransfer: z.boolean(),
      }),
    ),
    steps: z.array(z.string()),
  })
  .strict();
const sessionsSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.string(),
        current: z.boolean(),
        createdAt: z.number().finite(),
        lastActiveAt: z.number().finite(),
      }),
    ),
    hasMore: z.boolean(),
  })
  .strict();
const workspaceSchema = z
  .object({
    workspaceName: z.string(),
    retainedCrdtBackups: z.number(),
    requests: z.array(exportSchema),
    deletionRequiresReview: z.literal(true),
  })
  .strict();
const workspace = (id: string) => `${base()}/workspaces/${encodeURIComponent(id)}/lifecycle`;
export const accountLifecycle = {
  plan: async () =>
    planSchema.parse((await api.get<DeletionPlan>(`${base()}/account/deletion-plan`)).data),
  sessions: async () =>
    sessionsSchema.parse(
      (await api.get<{ items: SessionSummary[]; hasMore: boolean }>(`${base()}/account/sessions`))
        .data,
    ),
  revoke: async (id: string) => {
    await api.post(`${base()}/account/sessions/${encodeURIComponent(id)}/revoke`, {});
  },
  workspace: async (id: string) =>
    workspaceSchema.parse((await api.get<LifecyclePlan>(workspace(id))).data),
  requestExport: async (id: string, confirmName: string) =>
    (await api.post<ExportRequest>(`${workspace(id)}/export-requests`, { confirmName })).data,
  transfer: async (id: string, newOwnerMemberId: string, confirmName: string) => {
    await api.post(`${workspace(id)}/transfer`, { newOwnerMemberId, confirmName });
  },
};
