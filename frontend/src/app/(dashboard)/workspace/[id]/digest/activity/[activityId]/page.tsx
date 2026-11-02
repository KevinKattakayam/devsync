import { notFound } from 'next/navigation';
import { DigestSource } from '@/components/digest/async-digest';
export const dynamic = 'force-dynamic';
export default async function SourcePage({
  params,
}: {
  params: Promise<{ id: string; activityId: string }>;
}) {
  if (process.env.FEATURE_ASYNC_DIGEST !== 'true') notFound();
  const { id, activityId } = await params;
  return <DigestSource workspaceId={id} activityId={activityId} />;
}
