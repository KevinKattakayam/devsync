import { AppShell } from '@/components/shell/app-shell';
export const dynamic = 'force-dynamic';
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell decisionReceiptsEnabled={process.env.FEATURE_DECISION_RECEIPTS === 'true'}>
      {children}
    </AppShell>
  );
}
