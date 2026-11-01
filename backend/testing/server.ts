import { validateFixtureConfiguration } from './fixture-auth';
async function main() {
  const { secret } = validateFixtureConfiguration(process.env);
  const [
    { default: express },
    { createServer },
    { prisma, withDatabase },
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
  outer.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }), express.json());
  outer.use('/__test', fixtures.router);
  outer.use((_req, _res, next) =>
    withDatabase(prisma, () => withAuthentication(fixtures.strategy, next)),
  );
  outer.use(app, errorMiddleware);
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
    });
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
