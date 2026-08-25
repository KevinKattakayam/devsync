import { PrismaClient } from '@prisma/client';
import { createTenantPrismaClient, TenantPrismaClient } from './tenant-prisma';

const globalForPrisma = globalThis as unknown as { prisma: TenantPrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  createTenantPrismaClient(new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['warn', 'error'],
    datasourceUrl: process.env.DATABASE_URL,
  }));

// Prevent hot-reload from creating new PrismaClient instances in development
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
