/** Runs only in the credential-free extractor container, never in the API. */
import { PDFParse } from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import { imageSize } from 'image-size';
import { MAX_EXTRACTED_BYTES } from '../services/extraction-client';
export async function parseBinary(buffer: Uint8Array, mimeType: string): Promise<string> {
  let text: string;
  if (mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo();
      if (info.total < 1 || info.total > 20) throw new Error('Page limit');
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else {
    const dimensions = imageSize(buffer);
    const images = dimensions.images || [dimensions];
    let pixels = 0;
    if (images.length > 20) throw new Error('Frame limit');
    for (const image of images) {
      if (!image.width || !image.height) throw new Error('Invalid dimensions');
      pixels += image.width * image.height;
    }
    if (pixels > 16000000) throw new Error('Pixel limit');
    const worker = await createWorker('eng', 1, {
      langPath: process.env.OCR_LANG_PATH || '/app/ocr-data',
      cacheMethod: 'none',
      gzip: true,
    });
    try {
      text = (await worker.recognize(Buffer.from(buffer))).data.text;
    } finally {
      await worker.terminate();
    }
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_EXTRACTED_BYTES) throw new Error('Text limit');
  return text;
}
if (require.main === module) {
  process.once('message', (message: unknown) => {
    void (async () => {
      try {
        if (
          !message ||
          typeof message !== 'object' ||
          !('buffer' in message) ||
          !(message.buffer instanceof Uint8Array) ||
          !('mimeType' in message) ||
          typeof message.mimeType !== 'string'
        )
          throw new Error('Invalid input');
        const text = await parseBinary(message.buffer, message.mimeType);
        process.send?.({ text }, () => process.exit(0));
      } catch {
        process.send?.({ error: 'Invalid document' }, () => process.exit(1));
      }
    })();
  });
}
