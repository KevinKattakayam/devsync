"use client";

import { useAuth } from "@/providers/auth-provider";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSocket } from "@/providers/socket-provider";
import {
  Zap, LayoutDashboard, FileText, Kanban, Code2, Settings,
  ChevronLeft, ChevronRight, Plus, Search, Bell, Moon, Sun,
  LogOut, User, Loader2, Menu, Sparkles
} from "lucide-react";
import { useTheme } from "next-themes";
import { getInitials, generateColor } from "@/lib/utils";
import { CommandPalette } from "@/components/command-palette";
import { AiCopilotDrawer } from "@/components/ai-copilot-drawer";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { isConnected, onlineUsers } = useSocket();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/login');
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const workspaceMatch = pathname.match(/\/workspace\/([^\/]+)/);
  const workspaceId = workspaceMatch ? workspaceMatch[1] : null;

  const navItems = workspaceId
    ? [
        { href: `/workspace/${workspaceId}`, icon: LayoutDashboard, label: 'Overview' },
        { href: `/workspace/${workspaceId}/docs`, icon: FileText, label: 'Documents' },
        { href: `/workspace/${workspaceId}/kanban`, icon: Kanban, label: 'Sprint Board' },
        { href: `/workspace/${workspaceId}/snippets`, icon: Code2, label: 'Code Snippets' },
        { href: `/workspace/${workspaceId}/settings`, icon: Settings, label: 'Settings' },
      ]
    : [
        { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      ];

  return (
    <div className="min-h-screen flex bg-background text-foreground selection:bg-primary/30 selection:text-foreground">
      {/* Glass Sidebar */}
      <aside className={`${sidebarOpen ? 'w-60' : 'w-16'} glass border-r border-white/10 flex flex-col transition-all duration-300 relative group z-30`}>
        {/* Logo Header */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-white/10">
          <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0 shadow-lg glow-sm">
            <Zap className="w-4 h-4 text-white" />
          </div>
          {sidebarOpen && (
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-indigo-300">
                DevSync
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                PRO
              </span>
            </div>
          )}
        </div>

        {/* Collapse Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-secondary text-muted-foreground hover:text-foreground z-40 shadow-md"
        >
          {sidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* Navigation Items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'gradient-primary text-white shadow-md shadow-primary/25 glow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.05]'
                }`}
              >
                <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}

          {!workspaceId && sidebarOpen && (
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground border border-dashed border-white/10 hover:border-primary/40 mt-4 hover:bg-white/[0.03] transition-all"
            >
              <Plus className="w-4 h-4 text-primary" /> Create Workspace
            </Link>
          )}
        </nav>

        {/* Real-time Socket Connection Banner */}
        <div className="p-3 border-t border-white/10 bg-black/20">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium ${isConnected ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 bg-slate-500/10'}`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            {sidebarOpen && <span>{isConnected ? 'Real-Time Sync Ready' : 'Connecting to Server...'}</span>}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Glass Top Header */}
        <header className="h-16 glass border-b border-white/10 flex items-center justify-between px-6 z-20">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <Menu className="w-5 h-5" />
            </button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
              <input
                type="text"
                placeholder="Search documents, tasks & snippets..."
                className="w-64 pl-9 pr-4 py-2 rounded-xl bg-secondary/40 border border-white/10 text-xs text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-9 h-9 rounded-xl glass flex items-center justify-center hover:border-primary/40 transition-colors text-muted-foreground hover:text-foreground"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
            </button>

            <button className="w-9 h-9 rounded-xl glass flex items-center justify-center hover:border-primary/40 transition-colors text-muted-foreground hover:text-foreground relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary animate-ping" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
            </button>

            {/* User Profile Pill */}
            <div className="relative ml-1">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2.5 p-1.5 rounded-xl glass border-white/10 hover:border-primary/40 transition-all"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-sm"
                  style={{ backgroundColor: generateColor(user?.email || '') }}
                >
                  {getInitials(user?.name || 'U')}
                </div>
                {user?.name && <span className="text-xs font-semibold hidden md:block text-foreground pr-1">{user.name}</span>}
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-12 w-52 glass-card border-white/10 p-2 z-50 animate-scale-in">
                    <div className="px-3 py-2 border-b border-white/10 mb-1">
                      <p className="text-xs font-bold text-foreground">{user?.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                    </div>
                    <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors">
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Dashboard View */}
        <main className="flex-1 overflow-y-auto">{children}</main>
        <CommandPalette />
        <AiCopilotDrawer />
      </div>
    </div>
  );
}
