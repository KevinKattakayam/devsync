import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function SuperadminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  if (user?.publicMetadata.systemRole !== 'SUPER_ADMIN') redirect('/dashboard');
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-7xl p-6">{children}</div></main>;
}
