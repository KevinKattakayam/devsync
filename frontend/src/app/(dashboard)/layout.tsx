import { AppShell } from '@/components/shell/app-shell';
export const dynamic = 'force-dynamic';
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      asyncDigestEnabled={process.env.FEATURE_ASYNC_DIGEST === 'true'}
      snippetSafetyEnabled={process.env.FEATURE_SNIPPET_SAFETY === 'true'}
      decisionReceiptsEnabled={process.env.FEATURE_DECISION_RECEIPTS === 'true'}
    >
      {children}
    </AppShell>
  );
}
