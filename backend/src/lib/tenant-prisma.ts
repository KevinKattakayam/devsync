import { Prisma, PrismaClient } from '@prisma/client';

/**
 * RLS-safe Prisma facade.  PostgreSQL LOCAL settings are reset at COMMIT or
 * ROLLBACK, so PgBouncer transaction pooling cannot leak a prior tenant.
 */
export type TenantTransaction = Prisma.TransactionClient;

export interface TenantPrismaClient extends PrismaClient {
  withTenantTransaction<T>(tenantId: string, operation: (tx: TenantTransaction) => Promise<T>): Promise<T>;
}

function assertTenantId(tenantId: string): void {
  if (!tenantId || tenantId.length > 191) {
    throw new Error('A valid tenant ID is required for an RLS-scoped transaction');
  }
}

export function createTenantPrismaClient(client: PrismaClient): TenantPrismaClient {
  return client.$extends({
    name: 'tenantTransactionContext',
    client: {
      async withTenantTransaction<T>(tenantId: string, operation: (tx: TenantTransaction) => Promise<T>): Promise<T> {
        assertTenantId(tenantId);
        return client.$transaction(async (tx) => {
          // `true` is mandatory: this setting exists only for this transaction.
          await tx.$executeRaw(Prisma.sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
          return operation(tx);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5_000, timeout: 15_000 });
      },
    },
  }) as unknown as TenantPrismaClient;
}
