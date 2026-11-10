'use client';
import type { LocalPersistenceStatus } from '@/lib/draft-persistence';
const labels: Record<LocalPersistenceStatus, string> = {
  loading: 'Loading local draft…',
  pending: 'Local edits awaiting persistence',
  persisted: 'Local draft persisted',
  quota_exceeded: 'Browser storage full — export this draft before closing',
  limit_exceeded: 'Local draft storage limit reached — export before closing',
  corrupt: 'Local storage could not be read — stored data was preserved',
  failed: 'Local persistence failed — export this draft before closing',
  purging: 'Removing the saved browser draft…',
  purged: 'Saved browser draft removed',
};
export function LocalDraftStatus({ status }: { status: LocalPersistenceStatus }) {
  const failure = !['loading', 'pending', 'persisted', 'purging', 'purged'].includes(status);
  return (
    <span
      role={failure ? 'alert' : 'status'}
      aria-live="polite"
      title="Local persistence is a committed browser database transaction, separate from server acknowledgement. Browser data may still be evicted or cleared."
    >
      {labels[status]}
    </span>
  );
}
