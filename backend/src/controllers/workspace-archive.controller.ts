import { Request, Response, NextFunction } from 'express';
import {
  snapshotWorkspaceArchive,
  recheckWorkspaceArchive,
} from '../services/workspace-archive-snapshot';
import { createWorkspaceZip } from '../services/workspace-archive-zip';

export async function exportWorkspaceArchive(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id || req.params.workspaceId);
    const userId = req.user!.userId;
    const snapshot = await snapshotWorkspaceArchive(userId, workspaceId);
    const zip = await createWorkspaceZip(snapshot.documents, snapshot.tasks);
    await recheckWorkspaceArchive(userId, workspaceId, snapshot.fingerprint);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment; filename="workspace-export.zip"');
    res.type('application/zip').send(zip);
  } catch (error) {
    next(error);
  }
}
