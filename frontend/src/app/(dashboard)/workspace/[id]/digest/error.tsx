'use client';
import { Button } from '@/components/ui';
export default function DigestError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-5xl space-y-4 px-4 py-8 md:px-8">
      <h1 className="text-[28px] font-semibold">Async digest</h1>
      <p>Digest unavailable.</p>
      <Button className="enabled:hover:opacity-100" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
