import { mockDeep } from 'jest-mock-extended';
import { Role } from '@prisma/client';
import { TenantPrismaClient } from '../lib/tenant-prisma';
import { ForbiddenError } from '../utils/errors';
import {
  authorizeWorkspace,
  READ_ROLES,
  withPrincipalAccess,
  withResourceAccess,
  withWorkspaceAccess,
  WRITE_ROLES,
} from '../security/workspace-policy';

jest.mock('../lib/prisma', () => ({ prisma: mockDeep<TenantPrismaClient>() }));

const database = mockDeep<TenantPrismaClient>();
const tooLong = 'x'.repeat(192);

it.each([
  ['empty principal', () => withPrincipalAccess('', async () => undefined, database)],
  ['overlong principal', () => withPrincipalAccess(tooLong, async () => undefined, database)],
  ['empty workspace principal', () => authorizeWorkspace('', 'workspace', READ_ROLES, database)],
  ['empty workspace ID', () => authorizeWorkspace('user', '', READ_ROLES, database)],
  ['overlong workspace ID', () => authorizeWorkspace('user', tooLong, READ_ROLES, database)],
  [
    'empty workspace mutation principal',
    () => withWorkspaceAccess('', 'workspace', WRITE_ROLES, async () => undefined, database),
  ],
  [
    'empty workspace mutation ID',
    () => withWorkspaceAccess('user', '', WRITE_ROLES, async () => undefined, database),
  ],
  [
    'overlong workspace mutation ID',
    () => withWorkspaceAccess('user', tooLong, WRITE_ROLES, async () => undefined, database),
  ],
  [
    'empty resource principal',
    () =>
      withResourceAccess('', 'document', 'resource', READ_ROLES, async () => undefined, database),
  ],
  [
    'empty resource ID',
    () => withResourceAccess('user', 'document', '', READ_ROLES, async () => undefined, database),
  ],
  [
    'overlong resource ID',
    () =>
      withResourceAccess('user', 'document', tooLong, READ_ROLES, async () => undefined, database),
  ],
])('rejects %s before database access', async (_case, operation) => {
  await expect(operation()).rejects.toBeInstanceOf(ForbiddenError);
  expect(database.$transaction).not.toHaveBeenCalled();
  expect(database.withTenantTransaction).not.toHaveBeenCalled();
  expect(database.user.findUnique).not.toHaveBeenCalled();
  expect(database.workspace.findUnique).not.toHaveBeenCalled();
  expect(database.workspaceMember.findUnique).not.toHaveBeenCalled();
  expect(database.workspaceMember.findMany).not.toHaveBeenCalled();
});

it('retains the explicit role sets used by workspace authorization', () => {
  expect(READ_ROLES).toEqual([Role.OWNER, Role.EDITOR, Role.VIEWER]);
  expect(WRITE_ROLES).toEqual([Role.OWNER, Role.EDITOR]);
});
