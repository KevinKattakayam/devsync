import { notFound } from 'next/navigation';
import { DecisionReceipts } from '@/components/decisions/decision-receipts';
export const dynamic = 'force-dynamic';
export default async function DecisionsPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.FEATURE_DECISION_RECEIPTS !== 'true') notFound();
  const { id } = await params;
  return <DecisionReceipts key={id} workspaceId={id} />;
}
