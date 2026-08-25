import axios from 'axios';
import { browserTraceId } from './tracing';

let tokenGetter: (() => Promise<string | null>) | null = null;
export const setTokenGetter = (getter: (() => Promise<string | null>) | null) => { tokenGetter = getter; };

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Request interceptor — attach token
api.interceptors.request.use(async (config) => {
  const token = await tokenGetter?.();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers.trace_id = browserTraceId();
  return config;
});

api.interceptors.response.use((response) => response, (error) => Promise.reject(error));

export default api;

// Auth API
export const authApi = { getMe: () => api.get('/auth/me') };

// Workspace API
export const workspaceApi = {
  list: () => api.get('/workspaces'),
  get: (id: string) => api.get(`/workspaces/${id}`),
  getActivities: (id: string) => api.get(`/workspaces/${id}/activities`),
  create: (data: { name: string; description?: string; icon?: string }) =>
    api.post('/workspaces', data),
  update: (id: string, data: any) => api.patch(`/workspaces/${id}`, data),
  delete: (id: string) => api.delete(`/workspaces/${id}`),
  invite: (id: string, data: { email: string; role: string }) =>
    api.post(`/workspaces/${id}/invite`, data),
  removeMember: (id: string, memberId: string) =>
    api.delete(`/workspaces/${id}/members/${memberId}`),
  search: (id: string, query: string, limit = 10) =>
    api.get(`/workspaces/${id}/search`, { params: { q: query, limit } }),
};

// Document API
export const documentApi = {
  list: (workspaceId: string) => api.get(`/workspaces/${workspaceId}/documents`),
  get: (id: string) => api.get(`/documents/${id}`),
  create: (workspaceId: string, data?: { title?: string; parentId?: string }) =>
    api.post(`/workspaces/${workspaceId}/documents`, data || {}),
  update: (id: string, data: any) => api.patch(`/documents/${id}`, data),
  delete: (id: string) => api.delete(`/documents/${id}`),
};

// Board/Task API
export const boardApi = {
  list: (workspaceId: string) => api.get(`/workspaces/${workspaceId}/boards`),
  create: (workspaceId: string, data: { name: string }) =>
    api.post(`/workspaces/${workspaceId}/boards`, data),
};

export const taskApi = {
  createColumn: (boardId: string, data: { name: string }) =>
    api.post(`/tasks/boards/${boardId}/columns`, data),
  updateColumn: (columnId: string, data: { name: string }) =>
    api.patch(`/tasks/columns/${columnId}`, data),
  deleteColumn: (columnId: string) => api.delete(`/tasks/columns/${columnId}`),
  create: (columnId: string, data: any) =>
    api.post(`/tasks/columns/${columnId}/tasks`, data),
  update: (taskId: string, data: any) => api.patch(`/tasks/tasks/${taskId}`, data),
  delete: (taskId: string) => api.delete(`/tasks/tasks/${taskId}`),
  move: (taskId: string, data: { columnId: string; position: number }) =>
    api.patch(`/tasks/tasks/${taskId}/move`, data),
};

export const githubRepositoryApi = {
  list: (workspaceId: string) => api.get(`/workspaces/${workspaceId}/github-repositories`),
  connect: (workspaceId: string, data: { repositoryId: string; owner: string; name: string; webhookSecret: string; installationId?: string; prOpenedColumnId?: string | null; prMergedColumnId?: string | null }) => api.post(`/workspaces/${workspaceId}/github-repositories`, data),
  update: (workspaceId: string, repositoryId: string, data: Record<string, unknown>) => api.patch(`/workspaces/${workspaceId}/github-repositories/${repositoryId}`, data),
  disconnect: (workspaceId: string, repositoryId: string) => api.delete(`/workspaces/${workspaceId}/github-repositories/${repositoryId}`),
};

// Snippet API
export const snippetApi = {
  list: (workspaceId: string) => api.get(`/workspaces/${workspaceId}/snippets`),
  create: (workspaceId: string, data: any) =>
    api.post(`/workspaces/${workspaceId}/snippets`, data),
  update: (id: string, data: any) => api.patch(`/snippets/${id}`, data),
  delete: (id: string) => api.delete(`/snippets/${id}`),
  execute: (data: { language: string; code: string; stdin?: string; env?: Record<string, string> }) =>
    api.post('/snippets/execute', data),
};

// AI API
export const aiApi = {
  complete: async (data: { prompt: string; context?: string; action?: string; workspaceId: string }) =>
    (async () => {
      const response = await fetch(`${API_URL}/ai/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${(await tokenGetter?.()) || ''}`,
      },
      body: JSON.stringify(data),
      });
      if (!response.ok) throw Object.assign(new Error(`AI request failed (${response.status})`), { status: response.status });
      return response;
    })(),
};
