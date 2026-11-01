'use client';
import { DashboardError } from '@/components/dashboard/dashboard-states';
export default function DashboardBoundary({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <DashboardError retry={retry} />
    </div>
  );
}
