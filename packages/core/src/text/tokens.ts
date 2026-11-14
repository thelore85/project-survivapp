const STOPWORDS = new Set(
  (
    // italiano
    'il lo la i gli le un uno una di a da in con su per tra fra e o ma se che chi cui non come dove quando ' +
    'quale quali cosa del dello della dei degli delle al allo alla ai agli alle dal dalla nel nella sul sulla ' +
    'mi ti si ci vi ne è sono sei era ho hai ha hanno posso puoi può devo deve fare faccio questo questa ' +
    'questi queste quello quella più anche molto senza ' +
    // inglese
    'the an of to in on at for with by from and or but if that who whom not how where when which what is are ' +
    'was were be been do does did can could should would i you he she it we they my your this these those ' +
    'there more also very without me its as ' +
    // spagnolo
    'el los las unos unas de en con por para entre y pero si que quien como donde cuando cual cuales es son ' +
    'era fue he has han puedo puedes puede debo debe hacer hago este esta estos estas ese esa mas tambien ' +
    'muy sin del al se lo le mi tu su'
  ).split(/\s+/),
);

/** Minuscole, senza accenti: la forma su cui confrontiamo le parole. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function tokenize(text: string): string[] {
  return normalizeText(text).match(/[a-z0-9]+/g) ?? [];
}

/** Token utili alla ricerca: senza stopword e senza parole di una lettera. */
export function contentTokens(text: string): string[] {
  return tokenize(text).filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/** Query FTS5 sicura: ogni termine tra virgolette, in OR. Stringa vuota se non c'è nulla da cercare. */
export function buildFtsQuery(text: string): string {
  const unique = [...new Set(contentTokens(text))];
  return unique.map((token) => `"${token}"`).join(' OR ');
}

/**
 * Due parole coincidono se sono uguali o condividono quasi tutto l'inizio
 * (build/built, boil/boiling, purify/purification): uno stemming grezzo ma indipendente dalla lingua.
 */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const shortest = Math.min(a.length, b.length);
  let common = 0;
  while (common < shortest && a[common] === b[common]) common++;
  return common >= 4 && common >= shortest - 2;
}

/** Quota dei termini distinti della domanda presenti nel testo. */
export function termCoverage(query: string, text: string): number {
  const queryTokens = [...new Set(contentTokens(query))];
  if (queryTokens.length === 0) return 0;
  const textTokens = [...new Set(tokenize(text))];
  const hits = queryTokens.filter((token) => textTokens.some((candidate) => sameWord(token, candidate))).length;
  return hits / queryTokens.length;
}
