import api from './api';
import type { Activity, Board, Workspace } from '@/types';

export interface DashboardDocument {
  id: string;
  title: string;
  updatedAt?: string;
  children?: DashboardDocument[];
}
export interface WorkspaceOverview {
  workspace: Workspace;
  documents: DashboardDocument[];
  boards: Board[];
  activities: Activity[];
  failures: ('documents' | 'tasks' | 'activity')[];
}
export interface DashboardOverview {
  userId: string;
  name: string;
  workspaces: WorkspaceOverview[];
}

// Keep fan-out bounded while using the existing tenant-authorized endpoints.
export async function loadDashboard(): Promise<DashboardOverview> {
  const [profile, workspaces] = await Promise.all([
    api.get<{ id: string; name: string }>('/auth/me'),
    api.get<Workspace[]>('/workspaces'),
  ]);
  const results: WorkspaceOverview[] = [];
  let index = 0;
  async function worker() {
    while (index < workspaces.data.length) {
      const position = index++;
      const workspace = workspaces.data[position];
      const [documents, boards, activities] = await Promise.allSettled([
        api.get<DashboardDocument[]>(`/workspaces/${workspace.id}/documents`),
        api.get<Board[]>(`/workspaces/${workspace.id}/boards`),
        api.get<Activity[]>(`/workspaces/${workspace.id}/activities`),
      ]);
      results[position] = {
        workspace,
        documents: documents.status === 'fulfilled' ? documents.value.data : [],
        boards: boards.status === 'fulfilled' ? boards.value.data : [],
        activities: activities.status === 'fulfilled' ? activities.value.data : [],
        failures: [
          ...(documents.status === 'rejected' ? ['documents' as const] : []),
          ...(boards.status === 'rejected' ? ['tasks' as const] : []),
          ...(activities.status === 'rejected' ? ['activity' as const] : []),
        ],
      };
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, workspaces.data.length) }, worker));
  return { userId: profile.data.id, name: profile.data.name, workspaces: results };
}
export function flattenDashboardDocuments(documents: DashboardDocument[]): DashboardDocument[] {
  return documents.flatMap((document) => [
    document,
    ...flattenDashboardDocuments(document.children || []),
  ]);
}
export function recentDocuments(workspaces: WorkspaceOverview[]) {
  return workspaces
    .flatMap(({ workspace, documents }) =>
      flattenDashboardDocuments(documents)
        .filter((document) => document.updatedAt && Number.isFinite(Date.parse(document.updatedAt)))
        .map((document) => ({ ...document, workspace })),
    )
    .sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''))
    .slice(0, 6);
}
export function assignedTasks(workspaces: WorkspaceOverview[], userId: string) {
  return workspaces
    .flatMap(({ workspace, boards }) =>
      boards.flatMap((board) =>
        board.columns.flatMap((column) =>
          column.tasks
            .filter((task) => task.assignee?.id === userId)
            .map((task) => ({ ...task, workspace, board: board.name, column: column.name })),
        ),
      ),
    )
    .sort(
      (a, b) =>
        (a.dueDate ? Date.parse(a.dueDate) : Infinity) -
        (b.dueDate ? Date.parse(b.dueDate) : Infinity),
    );
}
