'use client';

import { useSyncHealthStore } from '@/stores/sync-health.store';
import { usePathname } from 'next/navigation';

const display = {
  synced: { icon: '🟢', label: 'Synced', tone: 'border-emerald-400/30 text-emerald-300' },
  offline: { icon: '🟡', label: 'Offline (Saving Locally)', tone: 'border-amber-400/30 text-amber-200' },
  reconnecting: { icon: '🟠', label: 'Reconnecting...', tone: 'border-orange-400/30 text-orange-200' },
  payment_required: { icon: '🔴', label: 'Sync Blocked (Payment Required)', tone: 'border-rose-400/40 text-rose-200' },
} as const;

export function SyncStatusManager(): React.JSX.Element | null {
  const status = useSyncHealthStore((state) => state.status);
  const pathname = usePathname();

  // Only display the floating pill on active document/board editor routes or if payment/reconnecting
  const isCollabRoute = pathname.includes('/docs/') || pathname.includes('/kanban');
  if (!isCollabRoute && status !== 'payment_required' && status !== 'reconnecting') {
    return null;
  }

  // When synced, fade away after confirmed
  if (status === 'synced') {
    return null;
  }

  const item = display[status];
  return (
    <aside
      className={`fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-2xl border bg-slate-950/80 px-4 py-2.5 shadow-2xl backdrop-blur-xl transition-all ${item.tone}`}
      role="status"
    >
      <span className="text-sm font-medium">{item.icon} {item.label}</span>
      {status === 'payment_required' && (
        <a className="ml-3 rounded-lg bg-rose-500/20 px-2.5 py-1 text-xs font-semibold hover:bg-rose-500/30" href="/settings/billing">
          Upgrade Plan
        </a>
      )}
    </aside>
  );
}
