import { PDFParse } from 'pdf-parse';
import Tesseract from 'tesseract.js';
import * as Y from 'yjs';
import { queueEmbedding } from './embedding.service';
import { authorizeWorkspace, WRITE_ROLES, withWorkspaceAccess } from '../security/workspace-policy';
import { BadRequestError } from '../utils/errors';
import { richTextSchema } from '../security/rich-text';
import { legacyDocument, projectDocument } from './crdt-schema';

// ── Tiptap/ProseMirror JSON builders ─────────────────────────

interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

function textNode(text: string): PMNode {
  return { type: 'text', text };
}

function paragraphNode(text: string): PMNode {
  return {
    type: 'paragraph',
    content: text.trim() ? [textNode(text)] : undefined,
  };
}

function headingNode(text: string, level: number): PMNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [textNode(text)],
  };
}

function tableNode(rows: string[][]): PMNode {
  const tableRows = rows.map((cells, rowIndex) => ({
    type: 'tableRow',
    content: cells.map((cell) => ({
      type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
      content: [paragraphNode(cell)],
    })),
  }));

  return {
    type: 'table',
    content: tableRows,
  };
}

// ── Text → Tiptap JSON conversion ───────────────────────────

function textToTiptapJson(text: string): PMNode {
  const lines = text.split('\n');
  const content: PMNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      i++;
      continue;
    }

    // Detect table-like structures (lines with multiple | separators)
    if (line.includes('|') && line.split('|').length >= 3) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        const row = lines[i]
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean);
        // Skip separator rows (---+--- or ---|---)
        if (!row.every((cell) => /^[-:]+$/.test(cell))) {
          tableRows.push(row);
        }
        i++;
      }
      if (tableRows.length > 0) {
        // Normalize column counts
        const maxCols = Math.max(...tableRows.map((r) => r.length));
        const normalized = tableRows.map((row) => {
          while (row.length < maxCols) row.push('');
          return row.slice(0, maxCols);
        });
        content.push(tableNode(normalized));
      }
      continue;
    }

    // Detect headings (ALL CAPS lines or lines ending with colon)
    if (line === line.toUpperCase() && line.length > 3 && line.length < 80 && /[A-Z]/.test(line)) {
      content.push(headingNode(line, 2));
      i++;
      continue;
    }

    // Detect bullet points
    if (/^[\-\•\*]\s/.test(line)) {
      const items: PMNode[] = [];
      while (i < lines.length && /^[\-\•\*]\s/.test(lines[i].trim())) {
        items.push({
          type: 'listItem',
          content: [paragraphNode(lines[i].trim().replace(/^[\-\•\*]\s/, ''))],
        });
        i++;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }

    // Detect numbered lists
    if (/^\d+[\.\)]\s/.test(line)) {
      const items: PMNode[] = [];
      while (i < lines.length && /^\d+[\.\)]\s/.test(lines[i].trim())) {
        items.push({
          type: 'listItem',
          content: [paragraphNode(lines[i].trim().replace(/^\d+[\.\)]\s/, ''))],
        });
        i++;
      }
      content.push({ type: 'orderedList', content: items });
      continue;
    }

    // Regular paragraph — accumulate consecutive non-empty lines
    let paragraph = line;
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].includes('|') &&
      !/^[\-\•\*\d]/.test(lines[i].trim())
    ) {
      paragraph += ' ' + lines[i].trim();
      i++;
    }
    content.push(paragraphNode(paragraph));
  }

  return {
    type: 'doc',
    content: content.length > 0 ? content : [paragraphNode('')],
  };
}

// ── PDF extraction ───────────────────────────────────────────

async function extractFromPDF(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const data = await parser.getText();
    return data.text || '';
  } finally {
    await parser.destroy();
  }
}

// ── Image OCR extraction ─────────────────────────────────────

async function extractFromImage(buffer: Buffer): Promise<string> {
  const { data } = await Tesseract.recognize(buffer, 'eng', {
    logger: (info) => {
      if (info.status === 'recognizing text') {
        // Progress logging — useful for large images
      }
    },
  });
  return data.text;
}

// ── Public API ───────────────────────────────────────────────

export interface IngestResult {
  documentId: string;
  title: string;
  extractedTextLength: number;
  sourceType: 'pdf' | 'image';
}

export async function ingestDocument(
  buffer: Buffer,
  mimeType: string,
  originalFilename: string,
  workspaceId: string,
  authorId: string,
): Promise<IngestResult> {
  await authorizeWorkspace(authorId, workspaceId, WRITE_ROLES);
  if (!buffer.length || buffer.length > 25 * 1024 * 1024 || originalFilename.length > 255)
    throw new BadRequestError('Invalid or oversized upload');
  // Determine source type
  const isPDF = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');
  const isText =
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    originalFilename.endsWith('.md') ||
    originalFilename.endsWith('.txt');

  if (!isPDF && !isImage && !isText) {
    throw new BadRequestError(
      `Unsupported file type: ${mimeType}. Supported: PDF, PNG, JPG, TIFF, Markdown, Text.`,
    );
  }

  // Extract text
  let extractedText: string;
  if (isPDF) {
    extractedText = await extractFromPDF(buffer);
  } else if (isImage) {
    extractedText = await extractFromImage(buffer);
  } else {
    extractedText = buffer.toString('utf8');
  }

  if (!extractedText.trim()) {
    throw new BadRequestError('No text could be extracted from the uploaded file.');
  }
  if (extractedText.length > 256 * 1024)
    throw new BadRequestError('Extracted text exceeds document limit');

  // Convert to Tiptap JSON
  const tiptapContent = textToTiptapJson(extractedText);

  // Generate title from filename
  const title = originalFilename
    .replace(/\.[^.]+$/, '') // Remove extension
    .replace(/[_-]+/g, ' ') // Replace separators with spaces
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 200); // Title case

  // Create document
  const document = await withWorkspaceAccess(authorId, workspaceId, WRITE_ROLES, async (tx) => {
    const state = legacyDocument(richTextSchema.parse(JSON.parse(JSON.stringify(tiptapContent))));
    try {
      const document = await tx.document.create({
        data: {
          title,
          content: projectDocument(state),
          yjsState: Buffer.from(Y.encodeStateAsUpdate(state)),
          icon: isPDF ? '📑' : '🖼️',
          authorId,
          workspaceId,
        },
      });

      // Log activity
      await tx.activity.create({
        data: {
          type: 'doc_ingested',
          message: `ingested ${isPDF ? 'PDF' : 'image'} "${originalFilename}" as document "${title}"`,
          metadata: {
            sourceType: isPDF ? 'pdf' : 'image',
            originalFilename,
            extractedTextLength: extractedText.length,
          },
          userId: authorId,
          workspaceId,
        },
      });

      // Queue embedding
      await queueEmbedding('document', document.id, tx, workspaceId, authorId);
      return document;
    } finally {
      state.destroy();
    }
  });

  return {
    documentId: document.id,
    title,
    extractedTextLength: extractedText.length,
    sourceType: isPDF ? 'pdf' : 'image',
  };
}
