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
const path = (workspaceId: string) =>
  `${(api.defaults.baseURL || '/api').replace(/\/v1\/?$/, '').replace(/\/$/, '')}/v2/workspaces/${encodeURIComponent(workspaceId)}/digest`;
export const digestApi = {
  preference: async (w: string) => (await api.get<DigestPreference>(`${path(w)}/preferences`)).data,
  setEnabled: async (w: string, enabled: boolean, expectedRevision: number) =>
    (await api.put<DigestPreference>(`${path(w)}/preferences`, { enabled, expectedRevision })).data,
  items: async (w: string, cursor?: string) =>
    (await api.get<DigestPage>(`${path(w)}/items`, { params: { cursor } })).data,
  acknowledge: async (w: string, activityId: string, expectedRevision: number) =>
    (await api.post<DigestPreference>(`${path(w)}/acknowledge`, { activityId, expectedRevision }))
      .data,
  event: async (w: string, id: string) =>
    (await api.get<DigestItem>(`${path(w)}/events/${encodeURIComponent(id)}`)).data,
};
