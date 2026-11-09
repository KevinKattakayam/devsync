import { notFound } from 'next/navigation';
import { Inbox } from '@/components/digest/inbox';
export const dynamic = 'force-dynamic';
export default async function InboxPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.FEATURE_ASYNC_DIGEST !== 'true') notFound();
  const { id } = await params;
  return <Inbox workspaceId={id} />;
}
