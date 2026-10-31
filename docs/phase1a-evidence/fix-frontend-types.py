from pathlib import Path
root=Path('frontend/src')
# Error objects are external input: narrow before accessing provider messages.
p=root/'lib/errors.ts';p.write_text('''import { isAxiosError } from 'axios';

export function errorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<{ error?: string }>(error) && typeof error.response?.data?.error === 'string') return error.response.data.error;
  return error instanceof Error ? error.message : fallback;
}
''')
for p in root.rglob('*.tsx'):
 s=p.read_text()
 if 'catch (err: any)' in s or 'catch (error: any)' in s:
  s="import { errorMessage } from '@/lib/errors';\n"+s if not s.startswith('"use client";') else s.replace('"use client";','"use client";\n\nimport { errorMessage } from \'@/lib/errors\';',1)
  s=s.replace('catch (err: any)','catch (err: unknown)').replace('catch (error: any)','catch (error: unknown)')
  import re
  s=re.sub(r'err\.response\?\.data\?\.error \|\| err\.message \|\| ("[^"]+")',r'errorMessage(err, \1)',s)
  s=re.sub(r'err\.response\?\.data\?\.error \|\| ("[^"]+")',r'errorMessage(err, \1)',s)
  s=re.sub(r'err\.message \|\| ("[^"]+")',r'errorMessage(err, \1)',s)
  s=re.sub(r'error\.response\?\.data\?\.error \|\| error\.message \|\| ("[^"]+")',r'errorMessage(error, \1)',s)
  p.write_text(s)
p=root/'types/index.ts';s=p.read_text();s="import type { JSONContent } from '@tiptap/react';\n\n"+s;s=s.replace('content: any;','content: JSONContent;\n  yjsState?: { type: string; data: number[] } | null;').replace('metadata?: any;','metadata?: Record<string, unknown>;');s+='\nexport interface PresenceUser { id: string; socketId: string; name: string; avatar?: string; }\n';p.write_text(s)
p=root/'lib/api.ts';s=p.read_text();s="import type { Task, Workspace, Snippet, Document } from '@/types';\n"+s
s=s.replace('data: any) => api.patch(`/workspaces/${id}`','data: Partial<Pick<Workspace, \'name\' | \'description\' | \'icon\'>>) => api.patch(`/workspaces/${id}`')
s=s.replace('data: any) => api.patch(`/documents/${id}`','data: Partial<Pick<Document, \'title\' | \'content\' | \'icon\' | \'isPublished\' | \'isArchived\'>>) => api.patch(`/documents/${id}`')
s=s.replace('data: any) =>\n    api.post(`/tasks/columns/${columnId}/tasks`','data: Partial<Task>) =>\n    api.post(`/tasks/columns/${columnId}/tasks`')
s=s.replace('data: any) => api.patch(`/tasks/tasks/${taskId}`','data: Partial<Task>) => api.patch(`/tasks/tasks/${taskId}`')
s=s.replace('data: any) =>\n    api.post(`/workspaces/${workspaceId}/snippets`','data: Pick<Snippet, \'title\' | \'code\' | \'language\'> & Partial<Pick<Snippet, \'description\'>>) =>\n    api.post(`/workspaces/${workspaceId}/snippets`')
s=s.replace('data: any) => api.patch(`/snippets/${id}`','data: Partial<Pick<Snippet, \'title\' | \'code\' | \'language\' | \'description\'>>) => api.patch(`/snippets/${id}`');p.write_text(s)
p=root/'providers/socket-provider.tsx';s=p.read_text();s="import type { PresenceUser } from '@/types';\n"+s if not s.startswith('"use client";') else s.replace('"use client";','"use client";\n\nimport type { PresenceUser } from \'@/types\';',1);s=s.replace('any[]','PresenceUser[]');p.write_text(s)
p=root/'components/workspace/presence-bar.tsx';s=p.read_text().replace('u.userId','u.id').replace('u.userName','u.name');p.write_text(s)
p=root/'components/command-palette.tsx';s=p.read_text().replace('icon: any;','icon: import("lucide-react").LucideIcon;');p.write_text(s)
p=root/'components/ai-copilot-drawer.tsx';s=p.read_text().replace('let workspaceContext =','const workspaceContext =');p.write_text(s)
p=root/'lib/tiptap-collaboration-cursor.ts';s=p.read_text();s="import type { HocuspocusProvider } from '@hocuspocus/provider';\n"+s;s=s.replace('provider: any;','provider: Pick<HocuspocusProvider, \'awareness\'> | null;').replace('(user: any)', '(user: { name: string; color: string })');p.write_text(s)
p=root/'app/(dashboard)/workspace/[id]/docs/[docId]/page.tsx';s=p.read_text();s=s.replace('import { useEffect,','import type { ReactNode } from "react";\nimport type { Doc } from "yjs";\nimport type { HocuspocusProvider } from "@hocuspocus/provider";\nimport { useEffect,');s=s.replace('ydoc: any;','ydoc: Doc;').replace('provider: any;','provider: HocuspocusProvider | null;').replace('onAiSources: (sources: any[]) => void;','onAiSources: (sources: { type: string; title: string; score: number }[]) => void;').replace('!(doc as any).yjsState','!doc.yjsState')
a=s.index('  const ToolBtn =');b=s.index('\n  return (',a);toolbar=s[a:b].replace('  const ToolBtn =','const ToolBtn =').replace('}: any)', '}: { onClick: () => unknown; active?: boolean; children: ReactNode; title: string })');s=s[:a]+s[b:];pos=s.index('function EditorInner(');s=s[:pos]+toolbar+'\n\n'+s[pos:]
s=s.replace('  const [saving, setSaving] = useState(false);','').replace("  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');",'')
a=s.index('  useEffect(() => {\n    setConnectionStatus(syncStatus);');b=s.index('\n  const userName',a);s=s[:a]+'''  const connectionStatus = syncStatus;
  const saving = !localReady;
''' +s[b:]
a=s.index('  const loadDoc = useCallback');b=s.index('\n  const saveTitle',a);s=s[:a]+'''  useEffect(() => {
    let disposed = false;
    documentApi.get(docId).then(({ data }) => {
      if (!disposed) { setDoc(data); setTitle(data.title); }
    }).catch(() => { if (!disposed) toast.error("Failed to load document"); });
    return () => { disposed = true; };
  }, [docId]);
''' +s[b:];p.write_text(s)
p=root/'app/(dashboard)/workspace/[id]/kanban/page.tsx';s=p.read_text().replace('data: any)', 'data: Partial<Task>)')
s=s.replace('const [boards, setBoards] = useState<Board[]>([]);','const boards = localBoards.value ?? [];')
s=s.replace('      setBoards(data);\n      localBoards.set(data);','      localBoards.set(data);')
a=s.index('  useEffect(() => {\n    if (localBoards.value)');b=s.index('\n  const persistBoards',a)
s=s[:a]+'''  useEffect(() => {
    let disposed = false;
    boardApi.list(id).then(({ data }) => { if (!disposed) localBoards.set(data); })
      .catch(() => { if (!disposed) toast.error("Failed to load boards"); })
      .finally(() => { if (!disposed) setIsLoading(false); });
    return () => { disposed = true; };
  }, [id, localBoards.set]);
''' +s[b:]
s=s.replace('    setBoards(next);\n','').replace('if (isLoading) return','if (isLoading && !localBoards.value) return')
a=s.index('  const loadBoards =');b=s.index('\n  useEffect(',a);s=s[:a]+s[b:];p.write_text(s)
# Remove an unnecessary property mutation; Y.Doc enables GC by default.
p=root/'hooks/use-crdt-garbage-collector.ts';s=p.read_text().replace('      document.gc = true;\n','');p.write_text(s)
# Declare async loaders before effects to satisfy immutability without exemptions.
for f,loader in [('app/(dashboard)/dashboard/page.tsx','loadWorkspaces'),('app/(dashboard)/workspace/[id]/docs/page.tsx','loadDocs'),('app/(dashboard)/workspace/[id]/page.tsx','loadWorkspace'),('app/(dashboard)/workspace/[id]/snippets/page.tsx','loadSnippets')]:
 p=root/f;s=p.read_text();import re
 pattern=r'  useEffect\(\(\) => \{ (?:if \(id\) )?'+loader+r'\(\); \}, \[(?:id)?\]\);\n'
 m=re.search(pattern,s);assert m,f;effect=m[0];s=s[:m.start()]+s[m.end():];a=s.index('  const '+loader);b=s.index('\n  };',a)+len('\n  };');s=s[:b]+'\n\n'+effect+s[b:];p.write_text(s)
p=root/'components/workspace/activity-feed.tsx';s=p.read_text().replace('    if (initialActivities.length === 0) {\n      fetchActivities();\n    }','    if (initialActivities.length === 0) {\n      workspaceApi.getActivities(workspaceId).then(({ data }) => setActivities(data)).catch(() => {});\n    }');p.write_text(s)
