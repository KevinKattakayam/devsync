'use client';
import type { SyncStatus } from '@/lib/local-first-yjs';
export function DocumentSyncStatus({
  status,
  pending,
  canWrite,
  accessDenied = false,
}: {
  status: SyncStatus;
  pending: boolean;
  canWrite: boolean;
  accessDenied?: boolean;
}) {
  const label = accessDenied
    ? 'Access unavailable — editing stopped'
    : status === 'offline'
      ? 'Offline — awaiting sync'
      : status === 'connecting'
        ? 'Connecting…'
        : pending
          ? 'Saving…'
          : 'Saved';
  return (
    <span
      role="status"
      aria-live="polite"
      title={
        accessDenied
          ? 'Pending local edits are not confirmed remotely. Check current workspace access before retrying.'
          : 'Saved means pending Yjs updates were acknowledged by the server journal. Offline edits still await remote confirmation; local browser persistence is separate.'
      }
    >
      {label}
      {!canWrite && status === 'connected' ? ' · Read only' : ''}
    </span>
  );
}
