'use client';

import { useCallback, useEffect, useRef } from 'react';

// Reference counting preserves inertness when modal layers overlap or unmount together.
const locks = new WeakMap<HTMLElement, { count: number; previous: boolean }>();
export function useInertBackground(open: boolean) {
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!open) {
      release.current?.();
      release.current = null;
    }
  }, [open]);
  useEffect(
    () => () => {
      release.current?.();
      release.current = null;
    },
    [],
  );
  return useCallback((content: HTMLElement | null) => {
    release.current?.();
    release.current = null;
    // Radix Select also renders into a detached fragment while closed.
    if (!content?.isConnected) return;
    const siblings = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        !element.contains(content) &&
        !element.matches('script, style, [data-radix-focus-guard], .ui-overlay'),
    );
    for (const element of siblings) {
      const lock = locks.get(element) || { count: 0, previous: element.inert };
      lock.count += 1;
      locks.set(element, lock);
      element.inert = true;
    }
    release.current = () => {
      for (const element of siblings) {
        const lock = locks.get(element);
        if (!lock) continue;
        lock.count -= 1;
        if (lock.count === 0) {
          element.inert = lock.previous;
          locks.delete(element);
        }
      }
    };
  }, []);
}
