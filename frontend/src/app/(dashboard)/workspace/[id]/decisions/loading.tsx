import { Skeleton } from '@/components/ui';
export default function DecisionLoading() {
  return (
    <div
      role="status"
      aria-label="Loading decision receipts"
      className="mx-auto max-w-5xl space-y-4 px-4 py-8 md:px-8"
    >
      <span className="sr-only">Loading decision receipts</span>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
