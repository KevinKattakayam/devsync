import { idempotencyKeyHeader } from '../lib/create-idempotency';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireOwner, requireEditor, requireWorkspaceMember } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createWorkspace,
  getWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  inviteMember,
  updateMemberRole,
  removeMember,
  getActivities,
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
} from '../controllers/workspace.controller';
import {
  getDocuments,
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
  createDocumentSchema,
  importMarkdown,
  importMarkdownSchema,
} from '../controllers/document.controller';
import {
  getBoards,
  exportTasksCsv,
  importTasksCsv,
  taskCsvImportSchema,
  createBoard,
  createColumn,
  updateColumn,
  deleteColumn,
  createTask,
  updateTask,
  deleteTask,
  moveTask,
  createBoardSchema,
} from '../controllers/task.controller';
import {
  getSnippets,
  createSnippet,
  updateSnippet,
  deleteSnippet,
  createSnippetSchema,
} from '../controllers/snippet.controller';
import {
  connectRepository,
  connectRepositorySchema,
  disconnectRepository,
  listRepositories,
  updateRepository,
  updateRepositorySchema,
} from '../controllers/github-repository.controller';
import { workspaceSearch } from '../controllers/search.controller';
import { exportWorkspaceArchive } from '../controllers/workspace-archive.controller';
import {
  createInvitation,
  acceptPendingInvitation,
  revokeInvitation,
  invitationSchema,
  acceptInvitationSchema,
} from '../controllers/invitation.controller';

const router = Router();

// All workspace routes require auth
router.use(authMiddleware);
router.post(
  '/invitations/:invitationId/accept',
  validate(acceptInvitationSchema),
  acceptPendingInvitation,
);
router.post(
  '/:id/invitations',
  requireOwner(),
  idempotencyKeyHeader,
  validate(invitationSchema),
  createInvitation,
);
router.delete('/:id/invitations/:invitationId', requireOwner(), revokeInvitation);

// Workspace CRUD
router.post('/', idempotencyKeyHeader, validate(createWorkspaceSchema), createWorkspace);
router.get('/', getWorkspaces);
router.get('/:id', requireWorkspaceMember(), getWorkspace);
router.get('/:id/activities', requireWorkspaceMember(), getActivities);
router.get('/:id/search', requireWorkspaceMember(), workspaceSearch);
router.patch('/:id', requireOwner(), validate(updateWorkspaceSchema), updateWorkspace);
router.delete('/:id', requireOwner(), deleteWorkspace);

// Members
router.post(
  '/:id/invite',
  requireOwner(),
  idempotencyKeyHeader,
  validate(inviteMemberSchema),
  inviteMember,
);
router.patch(
  '/:id/members/:memberId',
  requireOwner(),
  validate(updateMemberRoleSchema),
  updateMemberRole,
);
router.delete('/:id/members/:memberId', requireOwner(), removeMember);

// GitHub repository workflow configuration (webhook secret is never returned)
router.get('/:id/github-repositories', requireOwner(), listRepositories);
router.post(
  '/:id/github-repositories',
  requireOwner(),
  idempotencyKeyHeader,
  validate(connectRepositorySchema),
  connectRepository,
);
router.patch(
  '/:id/github-repositories/:repositoryId',
  requireOwner(),
  validate(updateRepositorySchema),
  updateRepository,
);
router.delete('/:id/github-repositories/:repositoryId', requireOwner(), disconnectRepository);

// Documents
router.get('/:id/documents', requireWorkspaceMember(), getDocuments);
router.post(
  '/:id/documents',
  requireEditor(),
  idempotencyKeyHeader,
  validate(createDocumentSchema),
  createDocument,
);

router.post(
  '/:id/documents/import-markdown',
  requireEditor(),
  idempotencyKeyHeader,
  validate(importMarkdownSchema),
  importMarkdown,
);

// Boards & Tasks
router.get('/:id/archive.zip', requireWorkspaceMember(), exportWorkspaceArchive);
router.get('/:id/tasks/export-csv', requireWorkspaceMember(), exportTasksCsv);
const taskCsvImportLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
router.post(
  '/:id/tasks/import-csv',
  requireEditor(),
  taskCsvImportLimiter,
  validate(taskCsvImportSchema),
  importTasksCsv,
);
router.get('/:id/boards', requireWorkspaceMember(), getBoards);
router.post(
  '/:id/boards',
  requireEditor(),
  idempotencyKeyHeader,
  validate(createBoardSchema),
  createBoard,
);

// Snippets
router.get('/:id/snippets', requireWorkspaceMember(), getSnippets);
router.post(
  '/:id/snippets',
  requireEditor(),
  idempotencyKeyHeader,
  validate(createSnippetSchema),
  createSnippet,
);

export default router;
