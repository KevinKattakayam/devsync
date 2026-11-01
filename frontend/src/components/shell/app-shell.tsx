'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useSocket } from '@/providers/socket-provider';
import {
  Avatar,
  AvatarStack,
  Button,
  Dialog,
  DialogContent,
  DialogTrigger,
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DropdownMenu,
  IconButton,
  Kbd,
  Skeleton,
  toast,
} from '@/components/ui';
import {
  Code2,
  FileText,
  Folder,
  HelpCircle,
  Kanban,
  LayoutDashboard,
  Loader2,
  Maximize2,
  Menu,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ChevronDown,
} from 'lucide-react';
import type { User } from '@/types';
import { CommandPalette } from '@/components/command-palette';
import { AiCopilotDrawer } from '@/components/ai-copilot-drawer';
import { DocumentTree, flattenDocuments } from './document-tree';
import { useShellData, useWorkspacePresence } from './use-shell-data';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/login');
  }, [isLoading, isAuthenticated, router]);
  if (isLoading)
    return (
      <div role="status" className="flex min-h-screen items-center justify-center gap-3 text-sm">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Loading workspace…
      </div>
    );
  if (!isAuthenticated || !user) return null;
  return (
    <Shell key={user.id} user={user}>
      {children}
    </Shell>
  );
}
function Shell({ children, user }: { children: ReactNode; user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { isConnected } = useSocket();
  const workspaceId = pathname.match(/^\/workspace\/([^/]+)/)?.[1];
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const snapshot = useShellData(user.id, workspaceId, pathname, commandsOpen);
  const workspaces = snapshot?.workspaces || [];
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const documents = snapshot?.documents || [];
  const people = useWorkspacePresence(workspaceId, workspace?.members, user.name);
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      mainRef.current?.focus();
    }
  }, [pathname]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const resize = () => {
      if (media.matches) setMobileOpen(false);
    };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setMobileOpen(false);
        setHelpOpen(false);
        setCommandsOpen((open) => !open);
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
      )
        return;
      if (
        event.key === '?' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')
      ) {
        event.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
  const closeNavigation = () => setMobileOpen(false);
  const base = workspaceId ? `/workspace/${workspaceId}` : '';
  const sections = [
    { path: '', label: 'Overview', icon: LayoutDashboard },
    { path: '/docs', label: 'Documents', icon: FileText },
    { path: '/kanban', label: 'Sprint board', icon: Kanban },
    { path: '/snippets', label: 'Code snippets', icon: Code2 },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];
  const section = sections.find((item) => item.path && pathname.startsWith(base + item.path));
  const docId = pathname.match(/\/docs\/([^/]+)/)?.[1];
  const documentTitle = flattenDocuments(documents).find((doc) => doc.id === docId)?.title;
  const currentLabel = workspaceId
    ? section?.label || 'Overview'
    : pathname.startsWith('/settings')
      ? 'Billing'
      : pathname.startsWith('/superadmin')
        ? 'Administration'
        : pathname.startsWith('/invitations')
          ? 'Invitation'
          : 'All workspaces';
  const navigation = (rail: boolean) => (
    <>
      <div className="shell-workspace">
        <DropdownMenu
          label="Switch workspace"
          trigger={
            <Button
              variant="ghost"
              aria-label={`Switch workspace${workspace ? `: ${workspace.name}` : ''}`}
              className="shell-workspace-trigger"
            >
              <Folder aria-hidden="true" className="size-4 shrink-0" />
              {!rail && (
                <>
                  <span className="truncate">{workspace?.name || 'All workspaces'}</span>
                  <ChevronDown aria-hidden="true" className="ml-auto size-3.5 shrink-0" />
                </>
              )}
            </Button>
          }
          items={[
            {
              id: 'all',
              label: 'All workspaces',
              onSelect: () => {
                closeNavigation();
                router.push('/dashboard');
              },
            },
            ...workspaces.map((item) => ({
              id: item.id,
              label: item.name,
              onSelect: () => {
                closeNavigation();
                router.push(`/workspace/${item.id}`);
              },
            })),
          ]}
        />
      </div>
      <nav aria-label="Workspace navigation" className="shell-navigation">
        <Link
          href="/dashboard"
          onClick={closeNavigation}
          aria-label="All workspaces"
          aria-current={pathname === '/dashboard' ? 'page' : undefined}
          className="shell-nav-link"
        >
          <LayoutDashboard aria-hidden="true" className="size-4 shrink-0" />
          {!rail && <span>All workspaces</span>}
        </Link>
        {workspaceId && (
          <div className="mt-4 space-y-1">
            {sections.map((item) => (
              <Link
                key={item.path}
                href={base + item.path}
                onClick={closeNavigation}
                aria-label={item.label}
                aria-current={
                  (item.path ? pathname.startsWith(base + item.path) : pathname === base)
                    ? 'page'
                    : undefined
                }
                className="shell-nav-link"
              >
                <item.icon aria-hidden="true" className="size-4 shrink-0" />
                {!rail && <span>{item.label}</span>}
              </Link>
            ))}
          </div>
        )}
        {workspaceId && !rail && (
          <section className="mt-7" aria-label="Document navigation">
            <h2 className="px-3 text-xs font-medium text-muted-foreground">Documents</h2>
            {!snapshot ? (
              <div
                role="status"
                aria-label="Loading document navigation"
                className="space-y-3 px-3 py-4"
              >
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ) : snapshot.error ? (
              <p role="status" className="px-3 py-4 text-xs text-muted-foreground">
                Navigation unavailable. Reload to retry.
              </p>
            ) : documents.length ? (
              <DocumentTree
                nodes={documents}
                workspaceId={workspaceId}
                pathname={pathname}
                onNavigate={closeNavigation}
              />
            ) : (
              <p className="px-3 py-4 text-xs text-muted-foreground">No documents yet.</p>
            )}
          </section>
        )}
      </nav>
      <div
        className="shell-connection"
        role="status"
        aria-label={isConnected ? 'Server connected' : 'Server disconnected'}
      >
        <span
          aria-hidden="true"
          className={`size-1.5 shrink-0 rounded-full ${isConnected ? 'bg-success' : 'bg-warning'}`}
        />
        {!rail && <span>{isConnected ? 'Server connected' : 'Server disconnected'}</span>}
      </div>
    </>
  );
  return (
    <div
      className="app-shell"
      data-collapsed={collapsed || undefined}
      data-focus={focus || undefined}
    >
      <a
        href="#main-content"
        className="ui-skip-link"
        data-shell-region="skip"
        onClick={() => mainRef.current?.focus()}
      >
        Skip to content
      </a>
      {!focus && (
        <aside data-shell-region="sidebar" aria-label="Sidebar" className="shell-sidebar">
          {navigation(collapsed)}
          <div className="shell-collapse">
            <IconButton
              label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </IconButton>
            {!collapsed && <span className="text-xs text-muted-foreground">DevSync</span>}
          </div>
        </aside>
      )}
      <div className="shell-workarea">
        <header data-shell-region="topbar" className="shell-topbar">
          {!focus && (
            <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
              <DrawerTrigger asChild>
                <IconButton label="Open navigation" className="md:hidden">
                  <Menu className="size-4" />
                </IconButton>
              </DrawerTrigger>
              <DrawerContent
                title="Navigation"
                description="Switch workspace or navigate your documents."
                className="shell-mobile-navigation"
              >
                {navigation(false)}
              </DrawerContent>
            </Drawer>
          )}
          <nav aria-label="Breadcrumb" className="shell-breadcrumb">
            <ol className="flex min-w-0 items-center gap-2">
              <li className="hidden min-w-0 sm:block">
                <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
                  Workspaces
                </Link>
              </li>
              {workspaceId && (
                <li className="hidden min-w-0 sm:block">
                  <span aria-hidden="true" className="mr-2 text-muted-foreground">
                    /
                  </span>
                  <Link href={base} className="inline-block max-w-40 truncate align-bottom">
                    {workspace?.name || 'Workspace'}
                  </Link>
                </li>
              )}
              <li className="min-w-0 truncate">
                <span aria-hidden="true" className="mr-2 hidden text-muted-foreground sm:inline">
                  /
                </span>
                {docId ? (
                  <>
                    <Link href={`${base}/docs`} className="hidden sm:inline">
                      Documents
                    </Link>
                    <span
                      aria-hidden="true"
                      className="mx-2 hidden text-muted-foreground sm:inline"
                    >
                      /
                    </span>
                    <span aria-current="page">{documentTitle || 'Document'}</span>
                  </>
                ) : (
                  <span aria-current="page">{currentLabel}</span>
                )}
              </li>
            </ol>
          </nav>
          <div className="shell-topbar-actions">
            <div className="hidden items-center gap-2 lg:flex" aria-label="Workspace presence">
              {people.length > 0 && (
                <>
                  <AvatarStack people={people} max={3} />
                  <span className="text-xs text-muted-foreground">{people.length} online</span>
                </>
              )}
            </div>
            {people.length > 0 && (
              <div className="lg:hidden" aria-label={`${people.length} workspace members online`}>
                <AvatarStack people={people.slice(0, 1)} max={1} />
              </div>
            )}
            <CommandPalette
              key={`${user.id}:${workspaceId || ''}`}
              open={commandsOpen}
              onOpenChange={setCommandsOpen}
              workspace={workspace}
              workspaces={workspaces}
              documents={documents}
              trigger={
                <Button variant="ghost" aria-label="Search and commands" className="shell-search">
                  <Search aria-hidden="true" className="size-4" />
                  <span className="hidden xl:inline">Search</span>
                  <span className="hidden xl:inline">
                    <Kbd>⌘ / Ctrl K</Kbd>
                  </span>
                </Button>
              }
              onHelp={() => setHelpOpen(true)}
              onFocus={() => setFocus((value) => !value)}
            />
            <IconButton
              label={focus ? 'Exit focus mode' : 'Enter focus mode'}
              aria-pressed={focus}
              onClick={() => setFocus((value) => !value)}
            >
              {focus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </IconButton>
            <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
              <DialogTrigger asChild>
                <IconButton label="Keyboard shortcuts" className="hidden sm:inline-flex">
                  <HelpCircle className="size-4" />
                </IconButton>
              </DialogTrigger>
              <DialogContent
                title="Keyboard shortcuts"
                description="Navigation and editing work with your keyboard."
              >
                <dl className="space-y-4 text-sm">
                  {[
                    ['Search and commands', '⌘ / Ctrl K'],
                    ['Show shortcuts outside text fields', '?'],
                    ['Close a menu or dialog', 'Esc'],
                    ['Move between controls', 'Tab / Shift Tab'],
                    ['Choose a command', '↑ / ↓ / Enter'],
                  ].map(([label, key]) => (
                    <div key={key} className="flex items-center justify-between gap-4">
                      <dt>{label}</dt>
                      <dd>
                        <Kbd>{key}</Kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </DialogContent>
            </Dialog>
            <DropdownMenu
              label="User menu"
              trigger={
                <Button variant="ghost" aria-label={user.name} className="shell-user">
                  <Avatar name={user.name} src={user.avatar} />
                  <span className="hidden max-w-32 truncate xl:inline">{user.name}</span>
                </Button>
              }
              items={[
                {
                  id: 'billing',
                  label: 'Billing settings',
                  onSelect: () => router.push('/settings/billing'),
                },
                {
                  id: 'logout',
                  label: signingOut ? 'Signing out…' : 'Sign Out',
                  disabled: signingOut,
                  onSelect: () => {
                    setSigningOut(true);
                    void logout().catch(() => {
                      setSigningOut(false);
                      toast.error('Could not sign out. Please retry.');
                    });
                  },
                },
              ]}
            />
          </div>
        </header>
        <main ref={mainRef} id="main-content" tabIndex={-1} className="shell-main">
          <div id="route-content" className="shell-route">
            {children}
          </div>
        </main>
        <AiCopilotDrawer />
      </div>
    </div>
  );
}
