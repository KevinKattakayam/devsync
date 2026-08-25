"use client";

import { Workspace } from "@/types";
import { FileText, Kanban, Code2, Users, CheckCircle2, TrendingUp } from "lucide-react";
import { getInitials, generateColor } from "@/lib/utils";

interface WorkspaceStatsProps {
  workspace: Workspace;
}

export function WorkspaceStats({ workspace }: WorkspaceStatsProps) {
  const docCount = workspace._count?.documents || 0;
  const boardCount = workspace._count?.boards || 0;
  const snippetCount = workspace._count?.snippets || 0;
  const memberCount = workspace.members?.length || 0;

  return (
    <div className="space-y-4 mb-6">
      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card-hover p-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-primary/10 rounded-full blur-xl group-hover:bg-primary/20 transition-all" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Documents</span>
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold text-foreground">{docCount}</p>
            <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> Active
            </span>
          </div>
        </div>

        <div className="glass-card-hover p-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Kanban Boards</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Kanban className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold text-foreground">{boardCount}</p>
            <span className="text-[10px] text-amber-400 font-medium">Sprint Ready</span>
          </div>
        </div>

        <div className="glass-card-hover p-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Code Snippets</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Code2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold text-foreground">{snippetCount}</p>
            <span className="text-[10px] text-emerald-400 font-medium">Shared</span>
          </div>
        </div>

        <div className="glass-card-hover p-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-all" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Team Size</span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-bold text-foreground">{memberCount}</p>
            <div className="flex -space-x-2">
              {workspace.members?.slice(0, 3).map((m) => (
                <div
                  key={m.id}
                  className="w-6 h-6 rounded-full border border-background flex items-center justify-center text-[9px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: generateColor(m.user.email || "") }}
                  title={m.user.name || m.user.email}
                >
                  {getInitials(m.user.name || "?")}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
