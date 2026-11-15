import { validateFixtureConfiguration } from './fixture-auth';
import { createRecoveryControls } from './recovery-controls';
import { createLoadPreflight } from './load-preflight';
import * as Y from 'yjs';
async function main() {
  const { secret } = validateFixtureConfiguration(process.env);
  const [
    { default: express },
    { createServer },
    { prisma },
    { withAuthentication },
    { default: app },
    { createFixtureAuthentication },
    { createSocketServer },
    { createCollaborationServer },
    { errorMiddleware },
    { default: cors },
  ] = await Promise.all([
    import('express'),
    import('http'),
    import('../src/lib/prisma'),
    import('../src/security/authentication'),
    import('../src/app'),
    import('./fixture-auth'),
    import('../src/socket/server'),
    import('../src/services/collaboration-server'),
    import('../src/middleware/error.middleware'),
    import('cors'),
  ]);
  const fixtures = createFixtureAuthentication(prisma, secret),
    outer = express();
  outer.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
  // Product routes own parsing, including their signed-webhook raw-byte capture.
  outer.use('/__test', express.json(), fixtures.router);
  outer.use('/__fixture', createLoadPreflight(process.env));
  outer.use((_req, _res, next) => withAuthentication(fixtures.strategy, next));
  const http = createServer(outer),
    socket = createSocketServer(http, {
      db: prisma,
      identify: fixtures.identifyRealtime,
      redisUrl: process.env.REDIS_URL,
    }),
    crdt = createCollaborationServer(http, {
      db: prisma,
      identify: fixtures.identifyRealtime,
      redisUrl: process.env.REDIS_URL,
      ...(process.env.E2E_RECOVERY === '1' ? { storeDebounceMs: 60000 } : {}),
    });
  if (process.env.E2E_RECOVERY === '1') {
    outer.use(
      '/__test/recovery',
      express.json(),
      createRecoveryControls(process.env, {
        generation: Number(process.env.E2E_GENERATION || 0),
        crash: () => {
          process.send?.('recovery:crash');
        },
        compact: (room) => crdt.journal.compact(room),
        state: (room, markers) =>
          prisma.withTenantTransaction(room.workspaceId, async (tx) => {
            const record = await tx.document.findUniqueOrThrow({
              where: { id: room.documentId, workspaceId: room.workspaceId },
            });
            const journalUpdates = markers?.length
              ? await tx.documentUpdate.findMany({
                  where: room,
                  orderBy: { id: 'asc' },
                  select: { update: true },
                })
              : undefined;
            const markerPresence = markers?.length
              ? (() => {
                  const document = new Y.Doc();
                  try {
                    if (record.yjsState) Y.applyUpdate(document, record.yjsState);
                    for (const update of journalUpdates ?? [])
                      Y.applyUpdate(document, update.update);
                    const xml = document.getXmlFragment('default').toString();
                    return Object.fromEntries(
                      markers.map((marker) => [marker, xml.includes(marker)]),
                    );
                  } finally {
                    document.destroy();
                  }
                })()
              : undefined;
            return {
              journalRows:
                journalUpdates?.length ?? (await tx.documentUpdate.count({ where: room })),
              snapshotBytes: record.yjsState?.length ?? 0,
              revision: record.crdtRevision,
              ...(markerPresence ? { markerPresence } : {}),
            };
          }),
      }),
      errorMiddleware,
    );
  }
  outer.use(app, errorMiddleware);
  await socket.ready;
  await new Promise<void>((resolve) =>
    http.listen(Number(process.env.PORT || 5501), '127.0.0.1', resolve),
  );
  console.log('Isolated fixture server ready');
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => process.exit(1), 15000);
    timer.unref();
    try {
      await socket.stop();
      await crdt.stop();
      await new Promise<void>((resolve) => http.close(() => resolve()));
      await prisma.$disconnect();
      clearTimeout(timer);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => {
    void stop();
  });
  process.on('SIGINT', () => {
    void stop();
  });
}
void main().catch(() => {
  console.error('Fixture server refused configuration or startup');
  process.exitCode = 1;
});
