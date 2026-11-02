import { Skeleton } from '@/components/ui';
export default function SafetyLoading() {
  return (
    <div
      role="status"
      aria-label="Loading snippet safety"
      className="mx-auto max-w-5xl space-y-4 px-4 py-8 md:px-8"
    >
      <span className="sr-only">Loading snippet safety</span>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
