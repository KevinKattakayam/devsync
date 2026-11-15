import api from './api';
export interface DigestPreference {
  enabled: boolean;
  revision: number;
  acknowledgedAt: string | null;
  acknowledgedId: string | null;
}
export interface DigestItem {
  activityId: string;
  recordedAt: string;
  eventType: 'doc_created' | 'snippet_created' | 'task_created';
  message: string;
  masked: boolean;
  source: { version: 1; kind: 'document' | 'snippet' | 'task'; id: string; revision: string };
}
export interface DigestPage {
  items: DigestItem[];
  nextCursor: string | null;
  until: string;
  from: string;
  preferenceRevision: number;
}
export type InboxItem = Omit<DigestItem, 'eventType'> & {
  eventType: DigestItem['eventType'] | 'task_assigned';
  category: 'activity' | 'assigned_task';
  read: boolean;
};
export interface InboxAutomationFailure {
  executionId: string;
  category: 'failed_automation';
  recordedAt: string;
  sourceKind: 'task' | 'github';
  read: boolean;
}
export type InboxPage = Omit<DigestPage, 'items'> & {
  items: InboxItem[];
  automationFailures: InboxAutomationFailure[];
};
export interface InboxDeliveryPreference {
  timezone: string;
  quietStart: number | null;
  quietEnd: number | null;
  batchMinutes: 15 | 60 | 1440;
}
const path = (workspaceId: string) =>
  `${(api.defaults.baseURL || '/api').replace(/\/v1\/?$/, '').replace(/\/$/, '')}/v2/workspaces/${encodeURIComponent(workspaceId)}/digest`;
export const digestApi = {
  preference: async (w: string) => (await api.get<DigestPreference>(`${path(w)}/preferences`)).data,
  setEnabled: async (w: string, enabled: boolean, expectedRevision: number) =>
    (await api.put<DigestPreference>(`${path(w)}/preferences`, { enabled, expectedRevision })).data,
  items: async (w: string, cursor?: string) =>
    (await api.get<DigestPage>(`${path(w)}/items`, { params: { cursor } })).data,
  inbox: async (w: string, cursor?: string) =>
    (
      await api.get<Omit<InboxPage, 'automationFailures'>>(`${path(w)}/inbox`, {
        params: { cursor },
      })
    ).data,
  automationFailures: async (w: string) =>
    (await api.get<{ items: InboxAutomationFailure[] }>(`${path(w)}/inbox/automation-failures`))
      .data,
  notificationPreferences: async (w: string) =>
    (await api.get<InboxDeliveryPreference>(`${path(w)}/notification-preferences`)).data,
  saveNotificationPreferences: async (w: string, input: InboxDeliveryPreference) =>
    (await api.put<InboxDeliveryPreference>(`${path(w)}/notification-preferences`, input)).data,
  batchPreview: async (w: string) =>
    (
      await api.get<{
        delivery: 'not_scheduled';
        batches: { activityIds: string[]; eligibleAt: string }[];
        nextCursor: string | null;
      }>(`${path(w)}/inbox/batch-preview`)
    ).data,
  setRead: async (w: string, id: string, read: boolean) =>
    (await api.put<{ read: boolean }>(`${path(w)}/inbox/${encodeURIComponent(id)}/read`, { read }))
      .data,
  setAutomationRead: async (w: string, id: string, read: boolean) =>
    (
      await api.put<{ read: boolean }>(
        `${path(w)}/inbox/automation-failures/${encodeURIComponent(id)}/read`,
        { read },
      )
    ).data,
  acknowledge: async (w: string, activityId: string, expectedRevision: number) =>
    (await api.post<DigestPreference>(`${path(w)}/acknowledge`, { activityId, expectedRevision }))
      .data,
  event: async (w: string, id: string) =>
    (await api.get<DigestItem>(`${path(w)}/events/${encodeURIComponent(id)}`)).data,
};
