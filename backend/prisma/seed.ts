import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { createTenantPrismaClient } from '../src/lib/tenant-prisma';

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production' || process.env.SEED_ALLOW_WRITE !== 'true')
    throw new Error('Seeding requires non-production and SEED_ALLOW_WRITE=true');
  const identities = [
    { role: Role.OWNER, clerkId: process.env.SEED_OWNER_CLERK_ID },
    { role: Role.EDITOR, clerkId: process.env.SEED_EDITOR_CLERK_ID },
    { role: Role.VIEWER, clerkId: process.env.SEED_VIEWER_CLERK_ID },
  ];
  if (
    identities.some((identity) => !identity.clerkId?.startsWith('user_')) ||
    new Set(identities.map((identity) => identity.clerkId)).size !== 3
  )
    throw new Error('Provide three distinct existing Clerk user IDs in SEED_*_CLERK_ID');
  const client = createTenantPrismaClient(new PrismaClient());
  try {
    await client.withTenantTransaction('devsync-sample', async (tx) => {
      const users = [];
      for (const identity of identities) {
        const user = await tx.user.upsert({
          where: { clerkId: identity.clerkId! },
          create: {
            clerkId: identity.clerkId!,
            email: `sample-${identity.role.toLowerCase()}@devsync.invalid`,
            name: `Sample ${identity.role.toLowerCase()}`,
          },
          update: {},
        });
        users.push({ user, role: identity.role });
      }
      await tx.workspace.upsert({
        where: { id: 'devsync-sample' },
        create: { id: 'devsync-sample', name: 'Sample workspace', slug: 'devsync-sample' },
        update: {},
      });
      for (const { user, role } of users)
        await tx.workspaceMember.upsert({
          where: { userId_workspaceId: { userId: user.id, workspaceId: 'devsync-sample' } },
          create: { userId: user.id, workspaceId: 'devsync-sample', role },
          update: { role },
        });
      await tx.document.upsert({
        where: { id: 'devsync-sample-doc' },
        create: {
          id: 'devsync-sample-doc',
          workspaceId: 'devsync-sample',
          authorId: users[0].user.id,
          title: 'Welcome',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Sample development workspace.' }],
              },
            ],
          },
        },
        update: {},
      });
      await tx.board.upsert({
        where: { id: 'devsync-sample-board' },
        create: { id: 'devsync-sample-board', workspaceId: 'devsync-sample', name: 'Main Board' },
        update: {},
      });
      await tx.column.upsert({
        where: { id: 'devsync-sample-todo' },
        create: {
          id: 'devsync-sample-todo',
          boardId: 'devsync-sample-board',
          name: 'To Do',
          position: 0,
        },
        update: {},
      });
      await tx.task.upsert({
        where: { id: 'devsync-sample-task' },
        create: {
          id: 'devsync-sample-task',
          columnId: 'devsync-sample-todo',
          title: 'Review workspace permissions',
          position: 0,
        },
        update: {},
      });
    });
    console.log('Sample workspace seeded. Sign in with the supplied Clerk test identities.');
  } finally {
    await client.$disconnect();
  }
}
seed().catch(() => {
  console.error(
    'Seed failed; check migration state, explicit identity IDs and non-production opt-in.',
  );
  process.exitCode = 1;
});
