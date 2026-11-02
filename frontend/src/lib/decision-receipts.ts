import api from './api';
export interface ReceiptContent {
  title: string;
  rationale: string;
  sourceKind: 'document' | 'task';
  sourceId: string;
  sourceRevision: string;
  excerpt: string;
}
export interface DecisionReceipt extends ReceiptContent {
  id: string;
  workspaceId: string;
  status: 'DRAFT' | 'ACCEPTED' | 'SUPERSEDED';
  revision: number;
  createdBy: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  supersededById: string | null;
  createdAt: string;
  updatedAt: string;
  sourceTitle: string;
  sourceChanged: boolean;
}
export interface ReceiptSource {
  kind: 'document' | 'task';
  id: string;
  title: string;
}
export interface ReceiptSourceDetail extends ReceiptSource {
  text: string;
  revision: string;
}
const base = () =>
  `${(api.defaults.baseURL || '/api').replace(/\/v1\/?$/, '').replace(/\/$/, '')}/v2/workspaces`;
export const decisionApi = {
  path: (workspaceId: string) => `${base()}/${encodeURIComponent(workspaceId)}/decisions`,
  list: async (w: string) => (await api.get<DecisionReceipt[]>(decisionApi.path(w))).data,
  sources: async (w: string, q = '') =>
    (await api.get<ReceiptSource[]>(`${decisionApi.path(w)}/sources`, { params: { q } })).data,
  source: async (w: string, kind: ReceiptSource['kind'], id: string) =>
    (await api.get<ReceiptSourceDetail>(`${decisionApi.path(w)}/source`, { params: { kind, id } }))
      .data,
  create: async (w: string, data: ReceiptContent, key: string) =>
    (
      await api.post<DecisionReceipt>(decisionApi.path(w), data, {
        headers: { 'Idempotency-Key': key },
      })
    ).data,
  edit: async (w: string, id: string, data: ReceiptContent, revision: number) =>
    (
      await api.patch<DecisionReceipt>(`${decisionApi.path(w)}/${encodeURIComponent(id)}`, {
        ...data,
        revision,
      })
    ).data,
  remove: async (w: string, id: string, revision: number) => {
    await api.delete(`${decisionApi.path(w)}/${encodeURIComponent(id)}`, { data: { revision } });
  },
  accept: async (w: string, id: string, revision: number) => {
    await api.post(`${decisionApi.path(w)}/${encodeURIComponent(id)}/accept`, { revision });
  },
  supersede: async (w: string, id: string, revision: number, replacementId: string) => {
    await api.post(`${decisionApi.path(w)}/${encodeURIComponent(id)}/supersede`, {
      revision,
      replacementId,
    });
  },
};
