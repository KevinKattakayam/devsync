import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';

export default async function SuperadminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  if (user?.publicMetadata.systemRole !== 'SUPER_ADMIN') redirect('/dashboard');
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-6">{children}</div>
    </AppShell>
  );
}
