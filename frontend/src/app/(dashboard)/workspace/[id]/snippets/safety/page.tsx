import { notFound } from 'next/navigation';
import { SnippetSafety } from '@/components/snippets/snippet-safety';
export const dynamic = 'force-dynamic';
export default async function SafetyPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.FEATURE_SNIPPET_SAFETY !== 'true') notFound();
  const { id } = await params;
  return <SnippetSafety workspaceId={id} />;
}
