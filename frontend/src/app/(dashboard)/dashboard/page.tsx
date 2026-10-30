'use client';

import { errorMessage } from '@/lib/errors';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { workspaceApi } from '@/lib/api';
import { Workspace } from '@/types';
import { getInitials, generateColor } from '@/lib/utils';
import { Plus, FileText, Kanban, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function DashboardPage() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);

  const loadWorkspaces = async () => {
    try {
      const { data } = await workspaceApi.list();
      setWorkspaces(data);
    } catch {
      toast.error('Failed to load workspaces');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let disposed = false;
    workspaceApi
      .list()
      .then(({ data }) => {
        if (!disposed) setWorkspaces(data);
      })
      .catch(() => {
        if (!disposed) toast.error('Failed to load workspace data');
      })
      .finally(() => {
        if (!disposed) setIsLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await workspaceApi.create(form);
      toast.success('Workspace created');
      setShowCreate(false);
      setForm({ name: '', description: '' });
      loadWorkspaces();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to create workspace'));
    } finally {
      setCreating(false);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const totalDocs = workspaces.reduce((s, w) => s + (w._count?.documents || 0), 0);
  const totalBoards = workspaces.reduce((s, w) => s + (w._count?.boards || 0), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">
          {greeting}, {user?.name?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Here&apos;s an overview of your workspaces
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Workspaces', value: workspaces.length, color: 'text-primary' },
          { label: 'Documents', value: totalDocs, color: 'text-blue-400' },
          { label: 'Boards', value: totalBoards, color: 'text-warning' },
          {
            label: 'Members',
            value: new Set(workspaces.flatMap((w) => w.members?.map((m) => m.user.id) || [])).size,
            color: 'text-success',
          },
        ].map((s, i) => (
          <div key={i} className="surface p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Workspaces */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Workspaces</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md gradient-primary text-white text-xs font-medium hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5" /> New
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : workspaces.length === 0 ? (
        <div className="surface p-10 text-center">
          <h3 className="text-sm font-semibold mb-1">No workspaces yet</h3>
          <p className="text-xs text-muted-foreground mb-4">Create one to get started</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md gradient-primary text-white text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> Create Workspace
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              href={`/workspace/${ws.id}`}
              className="surface p-4 hover:border-primary/30 transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{ws.icon}</span>
                  <div>
                    <h3 className="text-sm font-medium group-hover:text-primary transition-colors">
                      {ws.name}
                    </h3>
                    <p className="text-[11px] text-muted-foreground capitalize">
                      {ws.role?.toLowerCase()}
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
              {ws.description && (
                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{ws.description}</p>
              )}
              <div className="flex items-center justify-between pt-2.5 border-t border-border">
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {ws._count?.documents || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Kanban className="w-3 h-3" />
                    {ws._count?.boards || 0}
                  </span>
                </div>
                <div className="flex -space-x-1">
                  {ws.members?.slice(0, 3).map((m, i) => (
                    <div
                      key={i}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-medium text-white border border-background"
                      style={{ backgroundColor: generateColor(m.user.email || '') }}
                    >
                      {getInitials(m.user.name || '?')}
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          ))}
          <button
            onClick={() => setShowCreate(true)}
            className="surface p-4 border-dashed hover:border-primary/30 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary min-h-[140px]"
          >
            <Plus className="w-5 h-5" />
            <span className="text-xs font-medium">New Workspace</span>
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-sm p-5 shadow-xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-4">Create workspace</h2>
            <form onSubmit={createWorkspace} className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md bg-background border border-border focus:border-primary outline-none text-sm"
                  placeholder="My Project"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">
                  Description <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md bg-background border border-border focus:border-primary outline-none text-sm resize-none"
                  rows={2}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2 rounded-md border border-border text-xs hover:bg-muted/50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2 rounded-md gradient-primary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {creating && <Loader2 className="w-3 h-3 animate-spin" />} Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
