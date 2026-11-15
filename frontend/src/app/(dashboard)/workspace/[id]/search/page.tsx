import { KnowledgeSearch } from '@/components/search/knowledge-search';
export default async function SearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KnowledgeSearch key={id} workspaceId={id} />;
}
