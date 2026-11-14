import { t } from '../i18n';
import { normalizeText } from '../text/tokens';
import type { Lang, Notice } from '../types';

/**
 * Policy di sicurezza deterministiche (PRD sezione 13).
 * Controllano l'output del modello nel codice: non dipendono dal prompt e non sono configurabili.
 */

export type Violation = 'edibility_clearance' | 'certainty_claim' | 'confidence_percentage';

/** Affermazioni che, se non negate, danno un via libera al consumo. */
const EDIBILITY_CLAIMS = [
  /\bcommestibil\w*/g,
  /\bmangiabil\w*/g,
  /\bsi (?:puo|possono) (?:mangiare|consumare|bere)\b/g,
  /\bpuoi (?:mangiar\w*|consumar\w*)\b/g,
  /\b(?:sicur|buon)[oaie] da (?:mangiare|consumare)\b/g,
  /\bedible\b/g,
  /\bsafe (?:to eat|to consume|for consumption)\b/g,
  /\bcan be (?:eaten|consumed)\b/g,
  /\byou can (?:eat|consume)\b/g,
  /\bok to eat\b/g,
  /\bcomestibles?\b/g,
  /\bse (?:puede|pueden) (?:comer|consumir)\b/g,
  /\bpuedes (?:comer\w*|consumir\w*)\b/g,
  /\bsegur[oa]s? para (?:comer|consumir)\b/g,
];

/** Affermazioni di non pericolosità: qui la negazione è l'affermazione stessa. */
const SAFETY_CLAIMS = [
  /\bnon (?:e|sono) (?:tossic|velenos|pericolos)\w*/g,
  /\binnocu[oaie]\b/g,
  /\b(?:not|isn't|aren't|non) ?-?(?:poisonous|toxic)\b/g,
  /\bnontoxic\b/g,
  /\bharmless\b/g,
  /\bno (?:es|son) (?:toxic|venenos|peligros)\w*/g,
  /\binofensiv[oa]s?\b/g,
];

const CERTAINTY_CLAIMS = [
  /\bsicuramente\b/g,
  /\bcertamente\b/g,
  /\bsenza (?:alcun |nessun )?dubbio\b/g,
  /\bcon (?:assoluta )?certezza\b/g,
  /\bidentificazione (?:certa|sicura)\b/g,
  /\bdefinitely\b/g,
  /\bcertainly\b/g,
  /\bundoubtedly\b/g,
  /\bwithout (?:a |any )?doubt\b/g,
  /\bfor sure\b/g,
  /\bi am (?:sure|certain)\b/g,
  /\bsin (?:ninguna )?duda\b/g,
  /\bcon (?:total |toda )?(?:certeza|seguridad)\b/g,
  /\bdefinitivamente\b/g,
  /\bestoy segur[oa]\b/g,
];

const PERCENTAGE = /\b\d{1,3}(?:[.,]\d+)?\s?(?:%|percent\b|per cento\b|por ciento\b)/;

/**
 * Parole che, poco prima di un'affermazione, la negano.
 * Le ipotesi ("se", "if") restano fuori apposta: nel dubbio il testo viene scartato.
 */
const NEGATION = /\b(?:non|mai|senza|not|never|no|cannot|can't|don't|doesn't|isn't|aren't|without|nunca|ni|sin)\b/;

function hasUnnegatedMatch(normalized: string, patterns: RegExp[]): boolean {
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const before = normalized.slice(Math.max(0, match.index - 40), match.index);
      // Guarda solo la frase corrente: una negazione nella frase precedente non conta.
      const clause = before.split(/[.;:!?\n]/).pop() ?? '';
      if (!NEGATION.test(clause)) return true;
    }
  }
  return false;
}

/** Violazioni presenti in un testo generato. `botanical` controlla anche certezza e percentuali. */
export function findViolations(text: string, scope: 'botanical' | 'survival'): Violation[] {
  const normalized = normalizeText(text);
  const violations: Violation[] = [];
  const safetyClaim = SAFETY_CLAIMS.some((pattern) => normalized.search(pattern) >= 0);
  if (hasUnnegatedMatch(normalized, EDIBILITY_CLAIMS) || safetyClaim) violations.push('edibility_clearance');
  if (scope === 'botanical') {
    if (hasUnnegatedMatch(normalized, CERTAINTY_CLAIMS)) violations.push('certainty_claim');
    if (PERCENTAGE.test(normalized)) violations.push('confidence_percentage');
  }
  return violations;
}

/**
 * Toglie da un testo di catalogo le frasi che affermano commestibilità o innocuità:
 * anche una fonte enciclopedica, accanto a un candidato da foto, suonerebbe come un via libera.
 */
export function redactEdibilityClaims(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !findViolations(sentence, 'survival').includes('edibility_clearance'))
    .join(' ')
    .trim();
}

export type RiskTopic = 'ingestion' | 'first_aid' | 'water' | 'fire' | 'emergency';

const RISK_PATTERNS: Record<RiskTopic, RegExp> = {
  ingestion:
    /\b(?:mangi\w*|commestibil\w*|assaggi\w*|cucinar\w*|edible|eat\w*|taste\w*|cook\w*|comer|comestible\w*|cocinar\w*|ingest\w*|ingerir\w*|ingerire)\b/,
  first_aid:
    /\b(?:primo soccorso|first aid|primeros auxilios|ferit\w*|wound\w*|herid\w*|emorragi\w*|bleed\w*|hemorragi\w*|sangr\w*|frattur\w*|fractur\w*|ustion\w*|burn\w*|quemadur\w*|rcp|cpr|mors[oi]|bite\w*|mordedura\w*|avvelenament\w*|poisoning|envenenamiento\w*|intoxicacion\w*|ipotermi\w*|hypothermi\w*|hipotermi\w*|colpo di calore|heat ?stroke|golpe de calor|laccio emostatico|tourniquet|torniquete|svenut\w*|unconscious|inconsciente|shock)\b/,
  water: /\b(?:acqua|water|agua|potabil\w*|potable|purific\w*|purify\w*|bere|drink\w*|beber)\b/,
  fire: /\b(?:fuoco|fire|fuego|incendi\w*|wildfire)\b/,
  emergency: /\b(?:emergenz\w*|emergenc\w*|sos|soccors\w*|rescue\w*|rescate\w*|mi sono pers[oa]|i am lost|estoy perdid[oa])\b/,
};

export function detectRiskTopics(text: string): RiskTopic[] {
  const normalized = normalizeText(text);
  return (Object.keys(RISK_PATTERNS) as RiskTopic[]).filter((topic) => RISK_PATTERNS[topic].test(normalized));
}

/** Avvisi obbligatori per gli argomenti ad alto rischio toccati dalla domanda. */
export function riskNotices(topics: RiskTopic[], lang: Lang): Notice[] {
  const notices: Notice[] = [];
  const add = (code: Parameters<typeof t>[1], level: Notice['level']): void => {
    if (!notices.some((notice) => notice.code === code)) notices.push({ code, level, text: t(lang, code) });
  };
  if (topics.includes('ingestion')) add('notice.no_consumption', 'danger');
  if (topics.includes('first_aid')) add('notice.first_aid', 'danger');
  if (topics.includes('first_aid') || topics.includes('emergency')) add('notice.emergency', 'warning');
  if (topics.includes('water')) add('notice.water', 'warning');
  return notices;
}

/**
 * Toglie dal testo i riferimenti [n] che non corrispondono a un passaggio recuperato:
 * nessuna citazione può esistere senza una fonte.
 */
export function validateCitations(text: string, validMarkers: Set<number>): { text: string; cited: number[] } {
  const cited: number[] = [];
  const cleaned = text.replace(/\s?\[(\d+)\]/g, (whole, digits: string) => {
    const marker = Number(digits);
    if (!validMarkers.has(marker)) return '';
    if (!cited.includes(marker)) cited.push(marker);
    return whole;
  });
  return { text: cleaned, cited };
}

const UNIT_CLASSES: Record<string, string[]> = {
  mass: ['mg', 'g', 'kg', 'grammi', 'grams', 'gramos'],
  volume: ['ml', 'l', 'cl', 'litri', 'litro', 'liters', 'litres', 'liter', 'litre', 'litros', 'quart', 'quarts', 'gallon', 'gallons'],
  drops: ['gocce', 'goccia', 'drops', 'drop', 'gotas', 'gota'],
  minutes: ['min', 'minuti', 'minuto', 'minutes', 'minute', 'minutos'],
  hours: ['ore', 'ora', 'hours', 'hour', 'horas', 'hora'],
  days: ['giorni', 'giorno', 'days', 'day', 'dias', 'dia'],
  temperature: ['c', 'f', 'gradi', 'degrees', 'grados'],
  tablets: ['compresse', 'compressa', 'pastiglie', 'tablets', 'tablet', 'pastillas', 'tabletas'],
  length: ['mm', 'cm', 'm', 'km', 'metri', 'meters', 'metres', 'metros', 'inches', 'inch', 'feet', 'foot'],
  percent: ['%'],
};

const UNIT_TO_CLASS = new Map(
  Object.entries(UNIT_CLASSES).flatMap(([unitClass, units]) => units.map((unit) => [unit, unitClass] as const)),
);

function extractQuantities(text: string): Set<string> {
  const quantities = new Set<string>();
  const normalized = normalizeText(text).replace(/°\s?/g, '');
  for (const match of normalized.matchAll(/(\d+(?:[.,]\d+)?)\s?(%|[a-z]+)/g)) {
    const unitClass = UNIT_TO_CLASS.get(match[2] ?? '');
    if (unitClass) quantities.add(`${(match[1] ?? '').replace(',', '.')}|${unitClass}`);
  }
  return quantities;
}

/**
 * Quantità con unità di misura presenti nel testo generato ma in nessuna fonte:
 * un dosaggio o un valore che il modello potrebbe aver inventato.
 */
export function findUnsupportedQuantities(text: string, sources: string[]): string[] {
  const supported = new Set<string>();
  for (const source of sources) for (const quantity of extractQuantities(source)) supported.add(quantity);
  return [...extractQuantities(text)].filter((quantity) => !supported.has(quantity));
}
