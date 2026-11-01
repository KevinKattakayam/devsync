'use client';
import { Button } from '@/components/ui';
export default function EditorError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-semibold">Editor could not open</h1>
      <p className="my-4 text-sm text-muted-foreground">
        Retry to reopen the editor. Pending changes use the existing local document store.
      </p>
      <Button onClick={retry}>Retry editor</Button>
    </div>
  );
}
