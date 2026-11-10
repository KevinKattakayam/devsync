import { PDFParse } from 'pdf-parse';
import { renderDocumentPdf } from '../services/document-pdf';

test('renders headings and paragraphs into a valid text PDF without HTML execution', async () => {
  const bytes = await renderDocumentPdf('# Safe heading\n\nParagraph with safe text.');
  expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  const parser = new PDFParse({ data: bytes });
  try {
    const text = await parser.getText();
    expect(text.text).toContain('Safe heading');
    expect(text.text).toContain('Paragraph with safe text.');
  } finally {
    await parser.destroy();
  }
});
test('rejects oversized documents and unsupported Markdown explicitly', async () => {
  await expect(renderDocumentPdf('x'.repeat(256 * 1024 + 1))).rejects.toThrow();
  await expect(renderDocumentPdf('**formatted**')).rejects.toThrow();
  await expect(renderDocumentPdf('<script>alert(1)</script>')).rejects.toThrow();
});
test('rejects page count overflow', async () => {
  await expect(renderDocumentPdf(`# Heading\n\n${'word '.repeat(48999) + 'word'}`)).rejects.toThrow(
    'PDF page limit exceeded',
  );
});
