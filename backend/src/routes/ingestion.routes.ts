import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { ingestDocument } from '../services/ingestion.service';
import { prisma } from '../lib/prisma';
import { ForbiddenError, BadRequestError } from '../utils/errors';

const router = Router();

// ── Multer config — in-memory storage, 25MB limit ───────────

const ALLOWED_MIMES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/octet-stream',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError(`Unsupported file type: ${file.mimetype}. Accepted: PDF, PNG, JPG, TIFF, WebP.`) as any);
    }
  },
});

/**
 * POST /api/workspaces/:id/documents/ingest
 *
 * Upload a PDF or image file → extract text/tables via OCR →
 * convert to rich Tiptap document JSON.
 */
router.post(
  '/workspaces/:id/documents/ingest',
  authMiddleware,
  upload.single('file'),
  async (req, res, next) => {
    try {
      const workspaceId = String(req.params.id);
      const userId = req.user!.userId;

      // Verify workspace membership with editor role
      const member = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
      });
      if (!member || member.role === 'VIEWER') {
        throw new ForbiddenError('Requires EDITOR or OWNER role to ingest documents');
      }

      if (!req.file) {
        throw new BadRequestError('No file uploaded. Send a multipart form with a "file" field.');
      }

      const result = await ingestDocument(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
        workspaceId,
        userId,
      );

      res.status(201).json({
        message: 'Document ingested successfully',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
