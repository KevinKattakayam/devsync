'use client';
import { Button } from '@/components/ui';
export default function SafetyError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-5xl space-y-4 px-4 py-8 md:px-8">
      <h1 className="text-[28px] font-semibold">Snippet safety preflight</h1>
      <p>Could not load snippet safety.</p>
      <Button className="enabled:hover:opacity-100" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
