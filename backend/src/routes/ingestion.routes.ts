import { idempotencyKeyHeader } from '../lib/create-idempotency';
import { Router, RequestHandler } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { ingestDocument } from '../services/ingestion.service';
import { authorizeWorkspace, WRITE_ROLES } from '../security/workspace-policy';
import { BadRequestError } from '../utils/errors';

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
      cb(
        new BadRequestError(
          `Unsupported file type: ${file.mimetype}. Accepted: PDF, PNG, JPG, TIFF, WebP.`,
        ),
      );
    }
  },
});

/**
 * POST /api/workspaces/:id/documents/ingest
 *
 * Upload a PDF or image file → extract text/tables via OCR →
 * convert to rich Tiptap document JSON.
 */
export function createIngestionRouter(authenticate: RequestHandler = authMiddleware) {
  const router = Router();
  router.post(
    '/workspaces/:id/documents/ingest',
    authenticate,
    idempotencyKeyHeader,
    async (req, _res, next) => {
      try {
        await authorizeWorkspace(req.user!.userId, String(req.params.id), WRITE_ROLES);
        next();
      } catch (error) {
        next(error);
      }
    },
    upload.single('file'),
    async (req, res, next) => {
      try {
        const workspaceId = String(req.params.id);
        const userId = req.user!.userId;

        // Verify workspace membership with editor role
        await authorizeWorkspace(userId, workspaceId, WRITE_ROLES);

        if (!req.file) {
          throw new BadRequestError('No file uploaded. Send a multipart form with a "file" field.');
        }

        const result = await ingestDocument(
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname,
          workspaceId,
          userId,
          req.header('idempotency-key'),
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
  return router;
}
export default createIngestionRouter();
