export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt?: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon: string;
  role?: string;
  createdAt: string;
  updatedAt: string;
  members: WorkspaceMember[];
  _count?: {
    documents: number;
    boards: number;
    snippets?: number;
  };
  activities?: Activity[];
}

export interface WorkspaceMember {
  id: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
  joinedAt: string;
  user: User;
}

export interface Document {
  id: string;
  title: string;
  content: any;
  icon: string;
  isPublished: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  author: User;
  children?: Document[];
  parentId?: string;
}

export interface Board {
  id: string;
  name: string;
  columns: Column[];
}

export interface Column {
  id: string;
  name: string;
  position: number;
  tasks: Task[];
}

export interface Task {
  id: string;
  title: string;
  taskKey?: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  position: number;
  dueDate?: string;
  assignee?: User;
  labels: TaskLabel[];
  columnId: string;
}

export interface TaskLabel {
  id: string;
  name: string;
  color: string;
}

export interface Snippet {
  id: string;
  title: string;
  code: string;
  language: string;
  description?: string;
  author: User;
  createdAt: string;
}

export interface Activity {
  id: string;
  type: string;
  message: string;
  metadata?: any;
  createdAt: string;
  user: User;
}
