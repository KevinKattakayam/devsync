import { PrismaClient } from '@prisma/client';
import { createTenantPrismaClient, TenantPrismaClient } from './tenant-prisma';
import { AsyncLocalStorage } from 'async_hooks';

const globalForPrisma = globalThis as unknown as { prisma: TenantPrismaClient | undefined };

const defaultClient =
  globalForPrisma.prisma ??
  createTenantPrismaClient(
    new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['warn', 'error'],
      datasourceUrl: process.env.DATABASE_URL,
    }),
  );

// Prevent hot-reload from creating new PrismaClient instances in development
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = defaultClient;
}

const databaseContext = new AsyncLocalStorage<TenantPrismaClient>();
/** Composition-only binding: never derived from request headers or payloads. */
export function withDatabase<T>(database: TenantPrismaClient, operation: () => T): T {
  return databaseContext.run(database, operation);
}
export const prisma = new Proxy(defaultClient, {
  get(_target, property) {
    const active = databaseContext.getStore() ?? defaultClient;
    const value: unknown = Reflect.get(active, property);
    return typeof value === 'function' ? value.bind(active) : value;
  },
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
