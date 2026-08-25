"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { documentApi, boardApi, snippetApi } from "@/lib/api";
import { Document, Board, Snippet } from "@/types";
import {
  Search, FileText, Kanban, Code2, Sparkles, Moon, Sun,
  Plus, ArrowRight, LayoutDashboard, Settings, Command,
  CheckCircle2, Folder, ExternalLink, X, Terminal
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

interface CommandItem {
  id: string;
  title: string;
  category: "Navigation" | "Documents" | "Tasks" | "Snippets" | "Actions";
  icon: any;
  action: () => void;
  subtitle?: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const workspaceId = params?.id || (pathname.match(/\/workspace\/([^\/]+)/)?.[1]);
  const { theme, setTheme } = useTheme();

  // Search Data
  const [docs, setDocs] = useState<Document[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);

  // Keyboard shortcut listener (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Load workspace resources when palette opens
  useEffect(() => {
    if (open && workspaceId) {
      documentApi.list(workspaceId).then((r) => setDocs(r.data)).catch(() => {});
      boardApi.list(workspaceId).then((r) => setBoards(r.data)).catch(() => {});
      snippetApi.list(workspaceId).then((r) => setSnippets(r.data)).catch(() => {});
    }
  }, [open, workspaceId]);

  // Navigation and Action Items
  const items: CommandItem[] = [
    // Navigation
    ...(workspaceId ? [
      {
        id: "nav-overview",
        title: "Go to Workspace Overview",
        category: "Navigation" as const,
        icon: LayoutDashboard,
        action: () => { router.push(`/workspace/${workspaceId}`); setOpen(false); },
      },
      {
        id: "nav-docs",
        title: "Go to Documentation Hub",
        category: "Navigation" as const,
        icon: FileText,
        action: () => { router.push(`/workspace/${workspaceId}/docs`); setOpen(false); },
      },
      {
        id: "nav-kanban",
        title: "Go to Sprint Board",
        category: "Navigation" as const,
        icon: Kanban,
        action: () => { router.push(`/workspace/${workspaceId}/kanban`); setOpen(false); },
      },
      {
        id: "nav-snippets",
        title: "Go to Code Snippet Vault",
        category: "Navigation" as const,
        icon: Code2,
        action: () => { router.push(`/workspace/${workspaceId}/snippets`); setOpen(false); },
      },
      {
        id: "nav-settings",
        title: "Workspace Settings",
        category: "Navigation" as const,
        icon: Settings,
        action: () => { router.push(`/workspace/${workspaceId}/settings`); setOpen(false); },
      },
    ] : [
      {
        id: "nav-dashboard",
        title: "Go to Workspaces Dashboard",
        category: "Navigation" as const,
        icon: LayoutDashboard,
        action: () => { router.push("/dashboard"); setOpen(false); },
      },
    ]),

    // Quick Actions
    {
      id: "action-theme",
      title: `Toggle Theme (Current: ${theme})`,
      category: "Actions" as const,
      icon: theme === "dark" ? Sun : Moon,
      action: () => { setTheme(theme === "dark" ? "light" : "dark"); setOpen(false); },
    },
    ...(workspaceId ? [
      {
        id: "action-new-doc",
        title: "Create New Document",
        category: "Actions" as const,
        icon: Plus,
        subtitle: "Add real-time collaborative doc",
        action: async () => {
          setOpen(false);
          try {
            const { data } = await documentApi.create(workspaceId);
            router.push(`/workspace/${workspaceId}/docs/${data.id}`);
          } catch { toast.error("Failed to create document"); }
        },
      },
    ] : []),

    // Documents
    ...docs.map((d) => ({
      id: `doc-${d.id}`,
      title: d.title || "Untitled Document",
      category: "Documents" as const,
      icon: FileText,
      subtitle: `Document in ${workspaceId}`,
      action: () => { router.push(`/workspace/${workspaceId}/docs/${d.id}`); setOpen(false); },
    })),

    // Tasks from Kanban
    ...boards.flatMap((b) =>
      b.columns.flatMap((c) =>
        c.tasks.map((t) => ({
          id: `task-${t.id}`,
          title: t.title,
          category: "Tasks" as const,
          icon: CheckCircle2,
          subtitle: `Column: ${c.name} · Priority: ${t.priority}`,
          action: () => { router.push(`/workspace/${workspaceId}/kanban`); setOpen(false); },
        }))
      )
    ),

    // Code Snippets
    ...snippets.map((s) => ({
      id: `snippet-${s.id}`,
      title: s.title,
      category: "Snippets" as const,
      icon: Code2,
      subtitle: `${s.language.toUpperCase()} · ${s.description || "No description"}`,
      action: () => { router.push(`/workspace/${workspaceId}/snippets`); setOpen(false); },
    })),
  ];

  // Filter Items
  const filtered = items.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase())) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  // Keyboard navigation inside list
  const handleKeyNavigation = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/70 backdrop-blur-md p-4 animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl bg-slate-950/95 border border-white/15 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-2xl animate-scale-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyNavigation}
      >
        {/* Search Header */}
        <div className="flex items-center px-4 py-3.5 border-b border-white/10 gap-3">
          <Search className="w-5 h-5 text-primary animate-pulse" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Type a command, search documents, tasks, or snippets..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground bg-white/[0.05] px-2 py-1 rounded-md border border-white/10">
            <span>ESC</span>
          </div>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-xs">
              No matching commands or resources found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all ${
                    isSelected
                      ? "bg-primary/20 text-white border border-primary/30 shadow-md shadow-primary/10"
                      : "text-slate-300 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-1.5 rounded-lg ${isSelected ? "bg-primary text-white" : "bg-white/[0.05] text-muted-foreground"}`}>
                      <item.icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-[10px] text-muted-foreground truncate">{item.subtitle}</p>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md ${isSelected ? "text-primary bg-primary/20" : "text-muted-foreground/60 bg-white/[0.03]"}`}>
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-black/40 border-t border-white/10 flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span><strong className="text-foreground">↑↓</strong> Navigate</span>
            <span><strong className="text-foreground">↵</strong> Select</span>
            <span><strong className="text-foreground">ESC</strong> Close</span>
          </div>
          <span className="text-[10px] flex items-center gap-1">
            <Command className="w-3 h-3 text-primary" /> DevSync Spotlight
          </span>
        </div>
      </div>
    </div>
  );
}
