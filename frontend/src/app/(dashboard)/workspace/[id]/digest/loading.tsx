import { Skeleton } from '@/components/ui';
export default function DigestLoading() {
  return (
    <div
      role="status"
      aria-label="Loading async digest"
      className="mx-auto max-w-5xl space-y-4 px-4 py-8 md:px-8"
    >
      <span className="sr-only">Loading async digest</span>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
