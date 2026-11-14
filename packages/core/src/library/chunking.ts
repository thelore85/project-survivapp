export interface PageText {
  /** Numero di pagina (da 1), null per i file di testo senza pagine. */
  page: number | null;
  text: string;
}

export interface Chunk {
  ord: number;
  page: number | null;
  section: string | null;
  text: string;
}

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

const HEADING = /^(chapter|appendix|section|part|capitolo|appendice|sezione|parte|cap[ií]tulo|ap[eé]ndice|secci[oó]n)\b.{0,80}$/i;

/** Una riga è un titolo se inizia con una parola da titolo o è breve e tutta maiuscola. */
function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 4 || trimmed.length > 90) return false;
  if (HEADING.test(trimmed)) return true;
  const letters = trimmed.replace(/[^\p{L}]/gu, '');
  return letters.length >= 4 && letters === letters.toUpperCase() && /\p{L}/u.test(letters);
}

function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];
  const pieces: string[] = [];
  let current = '';
  for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
    if (current && current.length + sentence.length + 1 > maxChars) {
      pieces.push(current);
      current = '';
    }
    // Una frase più lunga del limite si taglia a forza: capita con l'OCR senza punteggiatura.
    let rest = sentence;
    while (rest.length > maxChars) {
      pieces.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    current = current ? `${current} ${rest}` : rest;
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * Divide le pagine in chunk che conservano pagina e sezione: sono i metadati delle citazioni.
 * Un chunk non attraversa mai il confine di pagina, così la pagina citata è sempre esatta.
 */
export function chunkPages(pages: PageText[], options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? 900;
  const overlapChars = options.overlapChars ?? 150;
  const chunks: Chunk[] = [];
  let section: string | null = null;

  for (const page of pages) {
    let current = '';
    let currentSection = section;
    const flush = (): void => {
      const text = current.trim();
      if (text.length >= 40) chunks.push({ ord: chunks.length, page: page.page, section: currentSection, text });
      current = '';
    };

    const paragraphs = page.text.split(/\n\s*\n/).flatMap((block) => {
      const lines = block.split('\n');
      const first = lines[0] ?? '';
      if (isHeading(first)) {
        section = first.trim();
        return [{ heading: true, text: lines.join(' ') }];
      }
      return [{ heading: false, text: lines.join(' ') }];
    });

    for (const paragraph of paragraphs) {
      const clean = paragraph.text.replace(/\s+/g, ' ').trim();
      if (!clean) continue;
      if (paragraph.heading && current) flush();
      if (!current) currentSection = section;
      // I pezzi lasciano spazio alla coda di sovrapposizione, così il chunk resta entro il limite.
      for (const piece of splitLongParagraph(clean, maxChars - overlapChars)) {
        if (current && current.length + piece.length + 1 > maxChars) {
          const tail = current.slice(-overlapChars);
          flush();
          currentSection = section;
          current = tail.slice(tail.indexOf(' ') + 1);
        }
        current = current ? `${current} ${piece}` : piece;
      }
    }
    flush();
  }
  return chunks;
}
