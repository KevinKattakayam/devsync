import api from './api';
import type { Snippet } from '@/types';
import type { SnippetFields, SafetyFinding } from './snippet-preflight';
export type SafetySnippet = Omit<Snippet, 'description'> & {
  description?: string | null;
  updatedAt: string;
};
const path = (workspaceId: string) =>
  `${(api.defaults.baseURL || '/api').replace(/\/v1\/?$/, '').replace(/\/$/, '')}/v2/workspaces/${encodeURIComponent(workspaceId)}/snippet-safety`;
export const snippetSafetyApi = {
  preflight: async (w: string, input: SnippetFields) =>
    (
      await api.post<{ content: SnippetFields; findings: SafetyFinding[] }>(
        `${path(w)}/preflight`,
        input,
      )
    ).data,
  findings: async (w: string, snippetId: string) =>
    (await api.get<SafetyFinding[]>(`${path(w)}/findings`, { params: { snippetId } })).data,
  save: async (w: string, content: SnippetFields, key: string, existing?: SafetySnippet) =>
    (
      await api.post<{ snippet: SafetySnippet; findings: SafetyFinding[] }>(
        `${path(w)}/save`,
        {
          content,
          confirmRedaction: true,
          ...(existing ? { snippetId: existing.id, expectedUpdatedAt: existing.updatedAt } : {}),
        },
        { headers: { 'Idempotency-Key': key } },
      )
    ).data,
};
