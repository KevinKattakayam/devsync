import api from './api';

export interface CreatedDashboardDocument {
  id: string;
  title: string;
  updatedAt: string;
}
interface DocumentRequests {
  create: () => Promise<CreatedDashboardDocument>;
  archive: (id: string) => Promise<void>;
}
interface DocumentObserver {
  committed: (document: CreatedDashboardDocument) => void;
  hidden: () => void;
  undone: () => void;
  failed: (stage: 'create' | 'undo', document?: CreatedDashboardDocument) => void;
}
export function startUndoableDocument(requests: DocumentRequests, observer: DocumentObserver) {
  let undoRequested = false;
  let document: CreatedDashboardDocument | undefined;
  let undoing: Promise<void> | undefined;
  const creation = requests.create().then((value) => {
    document = value;
    if (!undoRequested) observer.committed(value);
    else observer.hidden();
    return value;
  });
  void creation.catch(() => observer.failed('create'));
  const undo = () => {
    if (undoing) return undoing;
    undoRequested = true;
    observer.hidden();
    undoing = creation
      .then(async (value) => {
        try {
          await requests.archive(value.id);
          observer.undone();
        } catch {
          observer.failed('undo', value);
        }
      })
      .catch(() => {})
      .finally(() => {
        undoing = undefined;
      });
    return undoing;
  };
  return { undo, getDocument: () => document };
}
export function dashboardDocumentRequests(workspaceId: string, receipt: string): DocumentRequests {
  return {
    create: async () =>
      (
        await api.post<CreatedDashboardDocument>(
          `/workspaces/${workspaceId}/documents`,
          {},
          { headers: { 'Idempotency-Key': receipt } },
        )
      ).data,
    archive: async (id) => {
      await api.patch(`/documents/${id}`, { isArchived: true });
    },
  };
}
