"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { workspaceApi } from "@/lib/api";
import { Workspace } from "@/types";
import { getInitials, generateColor } from "@/lib/utils";
import { useSocket } from "@/providers/socket-provider";
import { useAuth } from "@/providers/auth-provider";
import { ActivityFeed } from "@/components/workspace/activity-feed";
import { WorkspaceStats } from "@/components/workspace/workspace-stats";
import { PresenceBar } from "@/components/workspace/presence-bar";
import { FileText, Kanban, Code2, Users, ArrowRight, Loader2, UserPlus, Sparkles, Plus, Cpu, GitBranch, Layers } from "lucide-react";
import { toast } from "sonner";

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('EDITOR');

  useEffect(() => { if (id) loadWorkspace(); }, [id]);

  useEffect(() => {
    if (socket && workspace && user) {
      socket.emit('workspace:join', { workspaceId: workspace.id, userName: user.name });
      return () => { socket.emit('workspace:leave', { workspaceId: workspace.id }); };
    }
  }, [socket, workspace, user]);

  const loadWorkspace = async () => {
    try {
      const { data } = await workspaceApi.get(id);
      setWorkspace(data);
    } catch {
      toast.error("Failed to load workspace");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await workspaceApi.invite(id, { email: inviteEmail, role: inviteRole });
      toast.success("Invitation sent successfully");
      setShowInvite(false);
      setInviteEmail('');
      loadWorkspace();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to invite member");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-xs text-muted-foreground animate-pulse">Loading developer workspace...</p>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="p-12 text-center max-w-md mx-auto glass-card">
        <p className="text-sm text-muted-foreground mb-4">Workspace not found or access denied</p>
        <Link href="/dashboard" className="px-4 py-2 rounded-lg gradient-primary text-white text-xs font-semibold">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const roleColors: Record<string, string> = {
    OWNER: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    EDITOR: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    VIEWER: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -z-10" />

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center text-3xl shadow-lg glow-sm">
            {workspace.icon || "💻"}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-foreground tracking-tight">{workspace.name}</h1>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Pro Workspace
              </span>
            </div>
            {workspace.description && (
              <p className="text-xs text-muted-foreground mt-1 max-w-xl line-clamp-1">{workspace.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <PresenceBar />
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl gradient-primary text-white text-xs font-semibold hover:opacity-90 transition-all shadow-md glow-sm"
          >
            <UserPlus className="w-4 h-4" /> Invite Member
          </button>
        </div>
      </div>

      {/* Analytics & Key Stats */}
      <WorkspaceStats workspace={workspace} />

      {/* Multi-Agent System Status & GitHub Integration Row */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Multi-Agent Background Workers */}
        <div className="glass-card p-5 border-white/10 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-foreground">Multi-Agent Engine (BullMQ)</h3>
                <p className="text-[10px] text-muted-foreground">Autonomous workspace workers</p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> 3 Daemon Workers Active
            </span>
          </div>

          <div className="space-y-2 mt-2">
            {[
              { name: "Task Completion Agent", desc: "Auto-summarizes completed tasks & creates audit docs", icon: "🤖", status: "Listening" },
              { name: "PR Summary Agent", desc: "Synthesizes incoming GitHub pull request diffs", icon: "🔀", status: "Active" },
              { name: "Vector Embedding Service", desc: "Semantic pgvector indexing for sub-ms retrieval", icon: "🧠", status: "Synced" },
            ].map((agent, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-base">{agent.icon}</span>
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">{agent.name}</p>
                    <p className="text-[9px] text-muted-foreground">{agent.desc}</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                  {agent.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* GitHub Live Repository Pipeline */}
        <div className="glass-card p-5 border-white/10 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <GitBranch className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-foreground">GitHub Webhook Pipeline</h3>
                <p className="text-[10px] text-muted-foreground">Automated PR & issue sync</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-bold">
              Connected
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 mb-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" /> devsync/enterprise-app
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">branch: main</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Webhook URL: <code className="text-sky-300 font-mono text-[9px]">/api/webhooks/github</code>
            </p>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-white/5">
            <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-primary" /> AI PR Summaries enabled</span>
            <span className="text-emerald-400 font-mono text-[10px]">Real-Time Sync Active</span>
          </div>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          {
            href: `/workspace/${id}/docs`,
            icon: FileText,
            title: 'Documentation Hub',
            desc: 'Real-time collaborative markdown, OCR & ADRs',
            count: workspace._count?.documents || 0,
            gradient: 'from-indigo-500/20 to-purple-500/10',
            iconColor: 'text-indigo-400',
            badge: 'Docs',
          },
          {
            href: `/workspace/${id}/kanban`,
            icon: Kanban,
            title: 'Sprint Board',
            desc: 'Manage tasks, sprints & multi-agent triggers',
            count: workspace._count?.boards || 0,
            gradient: 'from-amber-500/20 to-orange-500/10',
            iconColor: 'text-amber-400',
            badge: 'Kanban',
          },
          {
            href: `/workspace/${id}/snippets`,
            icon: Code2,
            title: 'Code Vault & Runner',
            desc: 'Interactive execution sandbox & semantic store',
            count: workspace._count?.snippets || 0,
            gradient: 'from-emerald-500/20 to-teal-500/10',
            iconColor: 'text-emerald-400',
            badge: 'Snippets',
          },
        ].map((item, i) => (
          <Link
            key={i}
            href={item.href}
            className={`glass-card-hover p-5 relative overflow-hidden bg-gradient-to-br ${item.gradient} border-white/10 group`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2.5 rounded-xl bg-background/50 backdrop-blur-md ${item.iconColor} border border-white/10`}>
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/10 text-slate-300 border border-white/10">
                {item.count} {item.badge}
              </span>
            </div>
            <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
              {item.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 mb-3">{item.desc}</p>
            <div className="flex items-center text-xs font-semibold text-primary group-hover:translate-x-1 transition-transform">
              <span>Open Workspace Section</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </Link>
        ))}
      </div>

      {/* Main Grid: Members & Activity Feed */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Members Column */}
        <div className="glass-card p-5 h-fit">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" /> Active Members ({workspace.members?.length || 0})
            </h3>
            <button
              onClick={() => setShowInvite(true)}
              className="p-1 rounded-md bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Add member"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {workspace.members?.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded-xl bg-secondary/20 hover:bg-secondary/50 transition-all border border-white/[0.03]">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md flex-shrink-0"
                  style={{ backgroundColor: generateColor(m.user.email || "") }}
                >
                  {getInitials(m.user.name || "?")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{m.user.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{m.user.email}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${roleColors[m.role]}`}>
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Stream Column */}
        <div className="lg:col-span-2">
          <ActivityFeed workspaceId={workspace.id} initialActivities={workspace.activities} />
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={() => setShowInvite(false)}>
          <div
            className="glass-card w-full max-w-sm p-6 shadow-2xl animate-scale-in border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-bold text-foreground mb-1">Invite Workspace Teammate</h2>
            <p className="text-xs text-muted-foreground mb-4">Grant access to documents, boards & code snippets.</p>

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Member Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs text-foreground placeholder:text-muted-foreground/60 transition-all"
                  placeholder="teammate@company.com"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Assign Permission Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/50 border border-border focus:border-primary outline-none text-xs text-foreground transition-all"
                >
                  <option value="EDITOR">Editor (Can create & edit items)</option>
                  <option value="VIEWER">Viewer (Read-only access)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-xs font-medium hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl gradient-primary text-white text-xs font-semibold hover:opacity-90 transition-opacity shadow-md glow-sm"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
