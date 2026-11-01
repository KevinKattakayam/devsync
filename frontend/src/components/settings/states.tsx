import { AlertCircle } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
export function SettingsLoading() {
  return (
    <div
      role="status"
      aria-label="Loading workspace settings"
      className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-8"
    >
      <span className="sr-only">Loading members and workspace permissions.</span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-10 w-full" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-20 w-full" />
      ))}
    </div>
  );
}
export function SettingsError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-4 rounded-lg bg-secondary p-4">
      <AlertCircle aria-hidden="true" className="size-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Workspace settings could not load</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Retry to check your access and load the latest members.
        </p>
      </div>
      <Button variant="secondary" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
