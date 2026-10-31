// Test-only executable; excluded from the production TypeScript build.
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import { createTenantPrismaClient } from '../../lib/tenant-prisma';
import { createCollaborationServer } from '../../services/collaboration-server';
const db = createTenantPrismaClient(new PrismaClient({ datasourceUrl: process.env.PHASE1B_TEST_DATABASE_URL }));
const http = createServer();
createCollaborationServer(http, {
  db, redisUrl: process.env.PHASE1B_TEST_REDIS_URL, storeDebounceMs: 60000,
  async identify(token) {
    if (token !== 'a') throw new Error('Invalid fixture identity');
    return { id: token, name: token, expiresAt: Date.now() + 60000 };
  },
});
http.listen(0, '127.0.0.1', () => {
  const address = http.address();
  if (address && typeof address !== 'string') process.send?.({ port: address.port });
});
