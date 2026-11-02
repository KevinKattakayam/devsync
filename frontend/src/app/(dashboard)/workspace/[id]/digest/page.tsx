import { notFound } from 'next/navigation';
import { AsyncDigest } from '@/components/digest/async-digest';
export const dynamic = 'force-dynamic';
export default async function DigestPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.FEATURE_ASYNC_DIGEST !== 'true') notFound();
  const { id } = await params;
  return <AsyncDigest workspaceId={id} />;
}
