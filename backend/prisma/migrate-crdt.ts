import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createTenantPrismaClient } from '../src/lib/tenant-prisma';
import { migrateDocument, MigrationMode } from '../src/services/crdt-migration';

async function main() {
  const modes = process.argv.slice(2).filter(value => ['--dry-run', '--apply', '--rollback'].includes(value));
  if (modes.length !== 1) throw new Error('Specify exactly one of --dry-run, --apply, --rollback');
  const mode = modes[0].slice(2) as MigrationMode;
  if (mode !== 'dry-run' && !process.argv.includes('--maintenance-confirmed')) throw new Error('Stop API/collaboration writers and pass --maintenance-confirmed; retain a database backup first');
  const db = createTenantPrismaClient(new PrismaClient());
  try {
    // Tenant-scoped pages also work with the non-superuser production role.
    for (let skip = 0; ; skip += 100) {
      const workspaces = await db.workspace.findMany({ take: 100, skip, orderBy: { id: 'asc' }, select: { id: true } });
      if (!workspaces.length) break;
      for (const workspace of workspaces) {
        for (let offset = 0; ; offset += 100) {
          const documents = await db.withTenantTransaction(workspace.id, tx => tx.document.findMany({ take: 100, skip: offset, orderBy: { id: 'asc' }, select: { id: true } }));
          if (!documents.length) break;
          for (const document of documents) {
            const result = await migrateDocument(db, { workspaceId: workspace.id, documentId: document.id }, mode);
            console.log(JSON.stringify({ workspaceId: workspace.id, documentId: document.id, mode, result }));
          }
        }
      }
    }
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error('CRDT migration failed; review database connectivity, schema, backup and maintenance requirements'); process.exitCode = 1; });
