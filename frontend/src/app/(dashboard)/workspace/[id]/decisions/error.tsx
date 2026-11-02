'use client';
import { Button } from '@/components/ui';
export default function DecisionError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-5xl space-y-4 px-4 py-8 md:px-8">
      <h1 className="text-[28px] font-semibold">Decision receipts</h1>
      <p>We could not load decision receipts.</p>
      <Button onClick={retry}>Try again</Button>
    </div>
  );
}
