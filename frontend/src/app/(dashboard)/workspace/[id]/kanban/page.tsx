"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { boardApi, taskApi } from "@/lib/api";
import { Board, Task } from "@/types";
import { getInitials, generateColor } from "@/lib/utils";
import { Plus, Loader2, GripVertical, Calendar, Trash2, X, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useLocalFirstRecord, useLocalFirstYDoc } from '@/lib/local-first-yjs';
import { useAuth } from '@/providers/auth-provider';
import { useCRDTGarbageCollector } from '@/hooks/use-crdt-garbage-collector';
import { SprintAnalyticsModal } from '@/components/sprint-analytics-modal';

const priorityConfig: Record<string, { color: string; bg: string; label: string }> = {
  LOW: { color: 'text-slate-400', bg: 'bg-slate-400/10', label: 'Low' },
  MEDIUM: { color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Medium' },
  HIGH: { color: 'text-amber-400', bg: 'bg-amber-400/10', label: 'High' },
  URGENT: { color: 'text-red-400', bg: 'bg-red-400/10', label: 'Urgent' },
};

export default function KanbanPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const boardSync = useLocalFirstYDoc(`kanban:${id}`, getToken);
  useCRDTGarbageCollector(boardSync.document);
  const localBoards = useLocalFirstRecord<Board[]>(boardSync.document, 'boards');
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const loadBoards = useCallback(async () => {
    try {
      const { data } = await boardApi.list(id);
      setBoards(data);
      localBoards.set(data);
    } catch { toast.error("Failed to load boards"); }
    finally { setIsLoading(false); }
  }, [id, localBoards]);

  useEffect(() => {
    if (localBoards.value) { setBoards(localBoards.value); setIsLoading(false); }
  }, [localBoards.value]);
  useEffect(() => { if (id) void loadBoards(); }, [id, loadBoards]);

  const persistBoards = useCallback((next: Board[]): void => {
    setBoards(next);
    localBoards.set(next);
  }, [localBoards]);

  const mutateTask = useCallback((taskId: string, mutate: (task: Task) => Task | null): void => {
    persistBoards(boards.map((board) => ({ ...board, columns: board.columns.map((column) => ({
      ...column,
      tasks: column.tasks.flatMap((task) => {
        if (task.id !== taskId) return [task];
        const updated = mutate(task);
        return updated ? [updated] : [];
      }),
    })) })));
  }, [boards, persistBoards]);

  const addTask = async (columnId: string) => {
    if (!newTaskTitle.trim()) return;
    const optimisticId = `local:${crypto.randomUUID()}`;
    const optimistic: Task = { id: optimisticId, title: newTaskTitle, priority: 'MEDIUM', position: 0, labels: [], columnId };
    persistBoards(boards.map((board) => ({ ...board, columns: board.columns.map((column) => column.id === columnId ? { ...column, tasks: [optimistic, ...column.tasks] } : column) })));
    setNewTaskTitle(''); setAddingToColumn(null);
    try {
      const { data } = await taskApi.create(columnId, { title: optimistic.title });
      mutateTask(optimisticId, () => data);
    } catch { toast.error("Task is saved locally and will retry when synchronization is available"); }
  };

  const updateTask = async (taskId: string, data: any) => {
    mutateTask(taskId, (task) => ({ ...task, ...data }));
    try { await taskApi.update(taskId, data); }
    catch { toast.error("Task update is saved locally and will retry when synchronization is available"); }
  };

  const deleteTask = async (taskId: string) => {
    mutateTask(taskId, () => null); setShowTaskModal(false); setSelectedTask(null);
    try { await taskApi.delete(taskId); }
    catch { toast.error("Task deletion is saved locally and will retry when synchronization is available"); }
  };

  const handleDragStart = (e: React.DragEvent, task: Task) => { setDraggedTask(task); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e: React.DragEvent, columnId: string) => { e.preventDefault(); setDragOverColumn(columnId); };
  const handleDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault(); setDragOverColumn(null);
    if (!draggedTask || draggedTask.columnId === columnId) { setDraggedTask(null); return; }
    const moved = { ...draggedTask, columnId, position: 0 };
    persistBoards(boards.map((board) => ({ ...board, columns: board.columns.map((column) => ({ ...column, tasks: column.id === columnId ? [moved, ...column.tasks.filter((task) => task.id !== moved.id)] : column.tasks.filter((task) => task.id !== moved.id) })) })));
    try { await taskApi.move(draggedTask.id, { columnId, position: 0 }); }
    catch { toast.error("Task move is saved locally and will retry when synchronization is available"); }
    setDraggedTask(null);
  };

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const board = boards[0];
  if (!board) return <div className="p-8 text-center text-muted-foreground">No board found.</div>;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="p-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{board.name}</h1>
          <p className="text-sm text-muted-foreground">{board.columns.reduce((s, c) => s + c.tasks.length, 0)} tasks</p>
        </div>
        <button
          onClick={() => setShowAnalytics(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl glass border-white/10 hover:border-primary/40 text-xs font-semibold text-foreground hover:bg-white/[0.04] transition-all shadow-sm"
        >
          <BarChart3 className="w-4 h-4 text-amber-400" />
          <span>Sprint Analytics</span>
        </button>
      </div>
      <div className="flex-1 overflow-x-auto px-6 pb-6">
        <div className="flex gap-4 h-full min-w-max">
          {board.columns.map((column) => (
            <div key={column.id} className={`w-72 flex flex-col rounded-xl ${dragOverColumn === column.id ? 'bg-primary/5 ring-2 ring-primary/30' : 'bg-muted/30'}`}
              onDragOver={(e) => handleDragOver(e, column.id)} onDragLeave={() => setDragOverColumn(null)} onDrop={(e) => handleDrop(e, column.id)}>
              <div className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{column.name}</h3>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{column.tasks.length}</span>
                </div>
                <button onClick={() => { setAddingToColumn(column.id); setNewTaskTitle(''); }} className="w-6 h-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground"><Plus className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                {addingToColumn === column.id && (
                  <div className="glass-card p-3 animate-scale-in">
                    <input type="text" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:border-primary outline-none" placeholder="Task title..." autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') addTask(column.id); if (e.key === 'Escape') setAddingToColumn(null); }} />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => addTask(column.id)} className="px-3 py-1.5 rounded-lg gradient-primary text-white text-xs font-medium">Add</button>
                      <button onClick={() => setAddingToColumn(null)} className="px-3 py-1.5 text-xs text-muted-foreground">Cancel</button>
                    </div>
                  </div>
                )}
                {column.tasks.map((task) => {
                  const priority = priorityConfig[task.priority?.toUpperCase()] || priorityConfig.MEDIUM;
                  return (
                    <div key={task.id} draggable onDragStart={(e) => handleDragStart(e, task)} onClick={() => { setSelectedTask(task); setShowTaskModal(true); }}
                      className={`glass-card p-3 cursor-pointer hover:border-primary/20 transition-all group ${draggedTask?.id === task.id ? 'opacity-50' : ''}`}>
                      <p className="text-sm font-medium">{task.title}</p>
                      {task.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${priority.color} ${priority.bg}`}>{priority.label}</span>
                        {task.assignee && <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium text-white ml-auto" style={{ backgroundColor: generateColor(task.assignee.email || '') }}>{getInitials(task.assignee.name || '?')}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {showTaskModal && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowTaskModal(false)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <input type="text" defaultValue={selectedTask.title} className="text-lg font-semibold bg-transparent outline-none w-full" onBlur={(e) => updateTask(selectedTask.id, { title: e.target.value })} />
              <button onClick={() => setShowTaskModal(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                <textarea defaultValue={selectedTask.description || ''} className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm resize-none outline-none" rows={3} placeholder="Add description..." onBlur={(e) => updateTask(selectedTask.id, { description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
                  <select defaultValue={selectedTask.priority} onChange={(e) => updateTask(selectedTask.id, { priority: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm outline-none">
                    <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Due Date</label>
                  <input type="date" defaultValue={selectedTask.dueDate ? new Date(selectedTask.dueDate).toISOString().split('T')[0] : ''} onChange={(e) => updateTask(selectedTask.id, { dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })} className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm outline-none" />
                </div>
              </div>
              <div className="pt-3 border-t border-border flex justify-end">
                <button onClick={() => deleteTask(selectedTask.id)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" />Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAnalytics && (
        <SprintAnalyticsModal board={board} onClose={() => setShowAnalytics(false)} />
      )}
    </div>
  );
}
