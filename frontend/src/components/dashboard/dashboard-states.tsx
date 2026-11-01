import { AlertCircle } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
export function DashboardLoading() {
  return (
    <div
      role="status"
      aria-label="Loading dashboard"
      className="mx-auto max-w-6xl space-y-8 p-4 md:p-8"
    >
      <span className="sr-only">Loading your documents, tasks and activity.</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-3/4" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {[0, 1].map((index) => (
          <div key={index} className="space-y-4">
            <Skeleton className="h-5 w-32" />
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-16 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
export function DashboardError({
  retry,
  title = 'Your dashboard could not load',
  description = 'Your work is still there. Try loading the dashboard again.',
}: {
  retry: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-4 rounded-lg bg-secondary p-4">
      <AlertCircle aria-hidden="true" className="size-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Button variant="secondary" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
