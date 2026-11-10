import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { BadRequestError } from '../utils/errors';
import { markdownToDocument } from './markdown-import';

const maxInput = 256 * 1024;
const maxPages = 40;
const maxPdfBytes = 2 * 1024 * 1024;
const pageWidth = 612;
const pageHeight = 792;
const margin = 54;

/** Render only the importer's text-only Markdown subset. No HTML parser or resource loader is used. */
export async function renderDocumentPdf(markdown: string): Promise<Uint8Array> {
  if (Buffer.byteLength(markdown, 'utf8') > maxInput)
    throw new BadRequestError('Document exceeds PDF export limit');
  const doc = markdownToDocument(markdown);
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  const newPage = () => {
    if (pdf.getPageCount() >= maxPages) throw new BadRequestError('PDF page limit exceeded');
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };
  const write = (text: string, heading: boolean) => {
    const font = heading ? bold : regular;
    const size = heading ? 16 : 11;
    const words = text.split(/\s+/);
    let line = '';
    const lines: string[] = [];
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      try {
        if (font.widthOfTextAtSize(candidate, size) <= pageWidth - 2 * margin) line = candidate;
        else if (line) {
          lines.push(line);
          line = word;
        } else throw new BadRequestError('PDF contains an unrenderable long word');
      } catch (error) {
        if (error instanceof BadRequestError) throw error;
        throw new BadRequestError('PDF contains unsupported characters');
      }
    }
    if (line) lines.push(line);
    y -= heading ? 8 : 4;
    for (const value of lines) {
      if (y < margin + size) newPage();
      try {
        page.drawText(value, { x: margin, y, size, font, color: rgb(0, 0, 0) });
      } catch {
        throw new BadRequestError('PDF contains unsupported characters');
      }
      y -= size * 1.45;
    }
    y -= heading ? 10 : 8;
  };
  for (const block of doc.content ?? []) {
    if (block.type === 'heading')
      write(block.content?.map((node) => node.text ?? '').join('') ?? '', true);
    else if (block.type === 'paragraph')
      write(block.content?.map((node) => node.text ?? '').join('') ?? '', false);
    else throw new BadRequestError('Unsupported document content for PDF');
  }
  const bytes = await pdf.save({ useObjectStreams: true });
  if (bytes.byteLength > maxPdfBytes) throw new BadRequestError('PDF export size limit exceeded');
  return bytes;
}
