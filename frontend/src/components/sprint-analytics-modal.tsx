"use client";

import { Board, Task } from "@/types";
import {
  BarChart3, X, TrendingUp, CheckCircle2, Clock,
  AlertTriangle, ShieldCheck, Zap, Activity
} from "lucide-react";

interface SprintAnalyticsModalProps {
  board: Board;
  onClose: () => void;
}

export function SprintAnalyticsModal({ board, onClose }: SprintAnalyticsModalProps) {
  const allTasks = board.columns.flatMap((c) => c.tasks);
  const totalTasks = allTasks.length;

  const doneColumn = board.columns.find((c) => c.name.toLowerCase().includes("done") || c.name.toLowerCase().includes("complete"));
  const inProgressColumn = board.columns.find((c) => c.name.toLowerCase().includes("progress") || c.name.toLowerCase().includes("active"));
  const backlogColumn = board.columns.find((c) => c.name.toLowerCase().includes("backlog") || c.name.toLowerCase().includes("to do"));

  const doneCount = doneColumn ? doneColumn.tasks.length : 0;
  const inProgressCount = inProgressColumn ? inProgressColumn.tasks.length : 0;
  const pendingCount = totalTasks - doneCount;

  const completionRate = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;

  // Priority distribution
  const priorityCounts = {
    URGENT: allTasks.filter((t) => (t.priority || "").toUpperCase() === "URGENT").length,
    HIGH: allTasks.filter((t) => (t.priority || "").toUpperCase() === "HIGH").length,
    MEDIUM: allTasks.filter((t) => (t.priority || "MEDIUM").toUpperCase() === "MEDIUM").length,
    LOW: allTasks.filter((t) => (t.priority || "").toUpperCase() === "LOW").length,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-slate-950 border border-white/15 rounded-3xl p-6 shadow-2xl backdrop-blur-2xl animate-scale-in flex flex-col space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground tracking-tight">
                {board.name} · Sprint Analytics
              </h2>
              <p className="text-xs text-muted-foreground">Velocity burndown and priority distribution</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <span className="text-[11px] text-muted-foreground font-medium">Sprint Velocity</span>
            <p className="text-2xl font-black text-foreground mt-1">{completionRate}%</p>
            <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="gradient-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <span className="text-[11px] text-muted-foreground font-medium">Completed</span>
            <p className="text-2xl font-black text-emerald-400 mt-1">{doneCount} / {totalTasks}</p>
            <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" /> Tasks Finished
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <span className="text-[11px] text-muted-foreground font-medium">In Flight</span>
            <p className="text-2xl font-black text-sky-400 mt-1">{inProgressCount}</p>
            <span className="text-[10px] text-sky-400 font-medium flex items-center gap-1 mt-1">
              <Activity className="w-3 h-3 animate-pulse" /> Active Work
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <span className="text-[11px] text-muted-foreground font-medium">Sprint Health</span>
            <p className="text-2xl font-black text-indigo-300 mt-1">
              {completionRate >= 50 ? "On Track" : totalTasks === 0 ? "Empty" : "In Progress"}
            </p>
            <span className="text-[10px] text-indigo-400 font-medium flex items-center gap-1 mt-1">
              <ShieldCheck className="w-3 h-3" /> Healthy Velocity
            </span>
          </div>
        </div>

        {/* Priority Breakdown & Burndown Visualizer */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Priority Breakdown */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
            <h3 className="text-xs font-bold text-foreground mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" /> Task Priority Distribution
            </h3>

            <div className="space-y-2.5">
              {[
                { label: "Urgent", count: priorityCounts.URGENT, color: "bg-rose-500", text: "text-rose-400" },
                { label: "High", count: priorityCounts.HIGH, color: "bg-amber-500", text: "text-amber-400" },
                { label: "Medium", count: priorityCounts.MEDIUM, color: "bg-sky-500", text: "text-sky-400" },
                { label: "Low", count: priorityCounts.LOW, color: "bg-slate-500", text: "text-slate-400" },
              ].map((p) => {
                const pct = totalTasks > 0 ? Math.round((p.count / totalTasks) * 100) : 0;
                return (
                  <div key={p.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`font-semibold ${p.text}`}>{p.label}</span>
                      <span className="text-muted-foreground font-mono">{p.count} tasks ({pct}%)</span>
                    </div>
                    <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                      <div className={`${p.color} h-full rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Simulated Burndown Curve */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
            <h3 className="text-xs font-bold text-foreground mb-1 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" /> Sprint Burndown Progress
            </h3>
            <p className="text-[10px] text-muted-foreground mb-3">Ideal line vs remaining tasks in sprint</p>

            <div className="h-32 flex items-end justify-between gap-2 pt-4 px-2 border-b border-l border-white/10">
              {[
                { day: "Day 1", remaining: totalTasks || 5, ideal: totalTasks || 5 },
                { day: "Day 3", remaining: Math.max(1, totalTasks - Math.floor(doneCount * 0.3)), ideal: Math.round((totalTasks || 5) * 0.75) },
                { day: "Day 5", remaining: Math.max(0, totalTasks - Math.floor(doneCount * 0.7)), ideal: Math.round((totalTasks || 5) * 0.5) },
                { day: "Day 7", remaining: pendingCount, ideal: 0 },
              ].map((point, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <div className="w-full flex items-end justify-center gap-1 h-20">
                    <div
                      className="w-3 bg-white/20 rounded-t-sm"
                      style={{ height: `${Math.min(100, (point.ideal / Math.max(1, totalTasks || 5)) * 100)}%` }}
                      title={`Ideal: ${point.ideal}`}
                    />
                    <div
                      className="w-3 gradient-primary rounded-t-sm"
                      style={{ height: `${Math.min(100, (point.remaining / Math.max(1, totalTasks || 5)) * 100)}%` }}
                      title={`Actual Remaining: ${point.remaining}`}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground">{point.day}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground pt-2">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white/30" /> Ideal Burn</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" /> Actual Remaining</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
