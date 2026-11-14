import type { PageText } from '@survivapp/core';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

interface TextItem {
  str: string;
  hasEOL: boolean;
}

/** Estrae il testo di un PDF pagina per pagina, conservando le interruzioni di riga. */
export async function extractPdfPages(bytes: Uint8Array): Promise<PageText[]> {
  const task = getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 });
  const pdf = await task.promise;
  const pages: PageText[] = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items as Partial<TextItem>[]) {
        if (typeof item.str !== 'string') continue;
        text += item.str + (item.hasEOL ? '\n' : ' ');
      }
      pages.push({ page: number, text: text.replace(/[ \t]+\n/g, '\n').trim() });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return pages;
}
