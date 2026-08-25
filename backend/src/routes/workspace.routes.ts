import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireOwner, requireEditor, requireWorkspaceMember } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createWorkspace, getWorkspaces, getWorkspace, updateWorkspace, deleteWorkspace,
  inviteMember, updateMemberRole, removeMember, getActivities,
  createWorkspaceSchema, updateWorkspaceSchema, inviteMemberSchema, updateMemberRoleSchema,
} from '../controllers/workspace.controller';
import {
  getDocuments, createDocument, getDocument, updateDocument, deleteDocument,
  createDocumentSchema,
} from '../controllers/document.controller';
import {
  getBoards, createBoard, createColumn, updateColumn, deleteColumn,
  createTask, updateTask, deleteTask, moveTask, createBoardSchema,
} from '../controllers/task.controller';
import {
  getSnippets, createSnippet, updateSnippet, deleteSnippet, createSnippetSchema,
} from '../controllers/snippet.controller';
import { connectRepository, connectRepositorySchema, disconnectRepository, listRepositories, updateRepository, updateRepositorySchema } from '../controllers/github-repository.controller';
import { workspaceSearch } from '../controllers/search.controller';

const router = Router();

// All workspace routes require auth
router.use(authMiddleware);

// Workspace CRUD
router.post('/', validate(createWorkspaceSchema), createWorkspace);
router.get('/', getWorkspaces);
router.get('/:id', requireWorkspaceMember(), getWorkspace);
router.get('/:id/activities', requireWorkspaceMember(), getActivities);
router.get('/:id/search', requireWorkspaceMember(), workspaceSearch);
router.patch('/:id', requireOwner(), validate(updateWorkspaceSchema), updateWorkspace);
router.delete('/:id', requireOwner(), deleteWorkspace);

// Members
router.post('/:id/invite', requireOwner(), validate(inviteMemberSchema), inviteMember);
router.patch('/:id/members/:memberId', requireOwner(), validate(updateMemberRoleSchema), updateMemberRole);
router.delete('/:id/members/:memberId', requireOwner(), removeMember);

// GitHub repository workflow configuration (webhook secret is never returned)
router.get('/:id/github-repositories', requireOwner(), listRepositories);
router.post('/:id/github-repositories', requireOwner(), validate(connectRepositorySchema), connectRepository);
router.patch('/:id/github-repositories/:repositoryId', requireOwner(), validate(updateRepositorySchema), updateRepository);
router.delete('/:id/github-repositories/:repositoryId', requireOwner(), disconnectRepository);

// Documents
router.get('/:id/documents', requireWorkspaceMember(), getDocuments);
router.post('/:id/documents', requireEditor(), validate(createDocumentSchema), createDocument);

// Boards & Tasks
router.get('/:id/boards', requireWorkspaceMember(), getBoards);
router.post('/:id/boards', requireEditor(), validate(createBoardSchema), createBoard);

// Snippets
router.get('/:id/snippets', requireWorkspaceMember(), getSnippets);
router.post('/:id/snippets', requireEditor(), validate(createSnippetSchema), createSnippet);

export default router;
