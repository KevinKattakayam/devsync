'use client';

import * as Y from 'yjs';
import { useEffect } from 'react';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

/** Safely prunes only resolved activity records; Yjs GC handles tombstones. */
export function useCRDTGarbageCollector(document: Y.Doc, intervalMs = 30 * 60 * 1000): void {
  useEffect(() => {
    const collect = (): void => {
      document.gc = true;
      const activities = document.getMap<string>('record:resolved-activities');
      const cutoff = Date.now() - SEVEN_DAYS;
      document.transact(() => activities.forEach((value, key) => {
        try {
          const activity = JSON.parse(value) as { resolvedAt?: number };
          if (activity.resolvedAt && activity.resolvedAt < cutoff) activities.delete(key);
        }
        catch { activities.delete(key); }
      }), 'devsync-gc');
    };
    collect();
    const timer = window.setInterval(collect, intervalMs);
    return () => window.clearInterval(timer);
  }, [document, intervalMs]);
}
