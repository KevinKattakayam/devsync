'use client';
import type { SyncStatus } from '@/lib/local-first-yjs';
export function DocumentSyncStatus({ status, pending, canWrite }: { status: SyncStatus; pending: boolean; canWrite: boolean }) {
  const label = status === 'offline' ? 'Offline — awaiting sync' : status === 'connecting' ? 'Connecting…' : pending ? 'Saving…' : 'Saved';
  return <span role="status" aria-live="polite">{label}{!canWrite && status === 'connected' ? ' · Read only' : ''}</span>;
}
