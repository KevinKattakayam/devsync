'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }): React.JSX.Element {
  useEffect(() => {
    console.error('[DevSync UI boundary error]', error?.message, error?.stack);
  }, [error]);
  return <main className="min-h-screen bg-background p-6 text-foreground"><section className="glass-card mx-auto mt-24 max-w-md border border-rose-400/20 p-6 text-center shadow-2xl"><p className="text-3xl">⚠️</p><h1 className="mt-3 text-xl font-bold">The view needs recovery</h1><p className="mt-2 text-sm text-muted-foreground">{error?.message || 'Your local edits remain in IndexedDB and will not be discarded.'}</p><button className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white" onClick={reset}>Retry sync</button></section></main>;
}
