import { t, type MessageKey } from '../i18n';
import type { LlmRuntime, VisionEmbedder } from '../runtime/types';
import { buildContextBlock, DATA_NOT_INSTRUCTIONS_RULE } from '../safety/context';
import { detectRiskTopics, findViolations, redactEdibilityClaims, validateCitations } from '../safety/policy';
import type { BotanicalAnswer, Candidate, Lang, Notice, RgbaImage, SpeciesRecord, TextBlock } from '../types';
import { summarize, type Catalogue } from './catalogue';
import { checkImageQuality } from './imageQuality';

export interface BotanyDeps {
  catalogue: Catalogue;
  vision: VisionEmbedder | null;
  llm: LlmRuntime | null;
}

export interface IdentifyRequest {
  image: RgbaImage;
  lang: Lang;
  /** Se l'utente ha detto che è una pianta o un fungo, il confronto si limita a quel gruppo. */
  kind?: 'plant' | 'fungus';
  question?: string;
  onToken?: (token: string) => void;
}

export interface SpeciesInfoRequest {
  question: string;
  lang: Lang;
  /** Specie del contesto della conversazione, es. i candidati dell'ultima foto. */
  speciesIds?: string[];
  onToken?: (token: string) => void;
}

const LANGUAGE_NAME: Record<Lang, string> = { it: 'Italian', en: 'English', es: 'Spanish' };
const MAX_CANDIDATES = 5;

function systemPrompt(lang: Lang): string {
  return [
    'You help compare plant and mushroom species using only the catalogue cards provided as numbered sources.',
    DATA_NOT_INSTRUCTIONS_RULE,
    'The cards are candidates found by visual similarity: never say that the photo shows a given species.',
    'Never express certainty and never give percentages or confidence values.',
    'Never say that a species is edible, safe, harmless or not poisonous.',
    'Point out the look-alike species and what should be checked to tell them apart.',
    `Answer in ${LANGUAGE_NAME[lang]}, briefly.`,
  ].join('\n');
}

function notice(lang: Lang, code: MessageKey, level: Notice['level']): Notice {
  return { code, level, text: t(lang, code) };
}

async function toCandidate(catalogue: Catalogue, record: SpeciesRecord, rank: number, lang: Lang): Promise<Candidate> {
  const description = record.descriptions[lang] ?? record.descriptions.en ?? null;
  const lookalikes = await catalogue.getMany(record.lookalikes);
  return {
    ...summarize(record, lang),
    rank,
    description: description ? redactEdibilityClaims(description) || null : null,
    featuresToVerify: Object.entries(record.features).map(([name, value]) => ({ name, value })),
    lookalikes: lookalikes.map((lookalike) => summarize(lookalike, lang)),
    sources: record.sources,
  };
}

function isDangerous(candidates: Candidate[]): boolean {
  const dangerous = (level: string): boolean => level === 'deadly' || level === 'toxic';
  return candidates.some(
    (candidate) => dangerous(candidate.toxicity) || candidate.lookalikes.some((lookalike) => dangerous(lookalike.toxicity)),
  );
}

function requestedDetails(candidates: Candidate[], lang: Lang): string[] {
  const details: MessageKey[] = [];
  if (candidates.some((candidate) => candidate.kind === 'fungus')) {
    details.push('detail.fungus.gills', 'detail.fungus.base', 'detail.fungus.ring', 'detail.fungus.habitat');
  }
  if (candidates.some((candidate) => candidate.kind === 'plant')) {
    details.push('detail.plant.leaf', 'detail.plant.flower', 'detail.plant.whole', 'detail.plant.habitat');
  }
  return details.map((key) => t(lang, key));
}

/** Avvisi che accompagnano sempre una risposta botanica con candidati. */
function baseNotices(candidates: Candidate[], lang: Lang, fromPhoto: boolean): Notice[] {
  const notices: Notice[] = [];
  if (fromPhoto) {
    notices.push(notice(lang, 'notice.identification_uncertain', 'warning'));
    notices.push(notice(lang, 'notice.similarity_not_probability', 'info'));
  }
  notices.push(notice(lang, 'notice.no_consumption', 'danger'));
  if (isDangerous(candidates)) notices.push(notice(lang, 'notice.dangerous_candidates', 'danger'));
  notices.push(notice(lang, 'notice.no_warning_not_safe', 'info'));
  return notices;
}

/**
 * Spiegazione generata sopra le schede: viene scartata per intero se viola una policy.
 * La struttura della risposta (candidati, avvisi, fonti) la costruisce sempre il codice.
 */
async function explain(
  llm: LlmRuntime | null,
  candidates: Candidate[],
  question: string,
  lang: Lang,
  notices: Notice[],
  onToken?: (token: string) => void,
): Promise<TextBlock | null> {
  if (!llm) return null;
  const context = buildContextBlock(
    candidates.map((candidate) => ({
      marker: candidate.rank,
      header: `${candidate.scientificName} (${candidate.kind})`,
      text: [
        candidate.description ?? '',
        candidate.toxicityNote ? `Warning: ${candidate.toxicityNote}` : '',
        candidate.lookalikes.length
          ? `Look-alikes: ${candidate.lookalikes.map((lookalike) => lookalike.scientificName).join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    })),
  );
  const generated = await llm.generate(
    { system: systemPrompt(lang), messages: [{ role: 'user', content: `${context}\n\nQuestion: ${question}` }], maxTokens: 300 },
    onToken,
  );
  const text = validateCitations(generated, new Set()).text.trim();
  if (!text) return null;
  if (findViolations(text, 'botanical').length > 0) {
    notices.push(notice(lang, 'notice.generated_removed', 'info'));
    return null;
  }
  return { provenance: 'generated', text };
}

/** Flusso botanico da fotografia: qualità, embedding, candidati dal catalogo, spiegazione verificata. */
export async function identifyFromPhoto(deps: BotanyDeps, request: IdentifyRequest): Promise<BotanicalAnswer> {
  const { lang } = request;
  const empty = { candidates: [], requestedDetails: [], imageIssues: [], notices: [] };

  const issues = checkImageQuality(request.image);
  if (issues.length > 0) {
    return {
      kind: 'botanical',
      status: 'retake_photo',
      blocks: [{ provenance: 'system', text: t(lang, 'botany.retake') }],
      ...empty,
      imageIssues: issues.map((issue) => t(lang, `issue.${issue}`)),
    };
  }

  if (!deps.vision || (await deps.catalogue.visionModel()) !== deps.vision.id) {
    return {
      kind: 'botanical',
      status: 'unavailable',
      blocks: [{ provenance: 'system', text: t(lang, 'botany.unavailable') }],
      ...empty,
    };
  }

  const vector = await deps.vision.embedImage(request.image);
  const threshold = deps.vision.relevanceThreshold;
  const matches = (await deps.catalogue.visualSearch(vector, MAX_CANDIDATES, request.kind)).filter(
    (match) => match.cosine >= threshold,
  );
  const candidates: Candidate[] = [];
  for (const match of matches) {
    const record = await deps.catalogue.get(match.speciesId);
    if (record) candidates.push(await toCandidate(deps.catalogue, record, candidates.length + 1, lang));
  }
  if (candidates.length === 0) {
    return {
      kind: 'botanical',
      status: 'no_candidates',
      blocks: [{ provenance: 'system', text: t(lang, 'botany.no_candidates') }],
      ...empty,
      notices: [notice(lang, 'notice.no_consumption', 'danger')],
    };
  }

  const notices = baseNotices(candidates, lang, true);
  const blocks: TextBlock[] = [
    { provenance: 'catalogue', text: t(lang, 'botany.candidates_intro') },
    { provenance: 'system', text: t(lang, 'botany.not_observable') },
  ];
  const explanation = await explain(
    deps.llm,
    candidates,
    request.question?.trim() || 'Compare the candidate species and say what to check.',
    lang,
    notices,
    request.onToken,
  );
  if (explanation) blocks.push(explanation);

  return {
    kind: 'botanical',
    status: 'candidates',
    blocks,
    candidates,
    requestedDetails: requestedDetails(candidates, lang),
    imageIssues: [],
    notices,
  };
}

/** Domanda testuale su una specie: schede dal catalogo, per nome o dal contesto della conversazione. */
export async function describeSpecies(deps: BotanyDeps, request: SpeciesInfoRequest): Promise<BotanicalAnswer> {
  const { lang, question } = request;
  const mentioned = await deps.catalogue.findMentioned(question);
  const records =
    mentioned.length > 0
      ? mentioned.slice(0, 3)
      : request.speciesIds?.length
        ? await deps.catalogue.getMany(request.speciesIds.slice(0, 3))
        : await deps.catalogue.searchText(question, 3);

  if (records.length === 0) {
    return {
      kind: 'botanical',
      status: 'no_candidates',
      blocks: [{ provenance: 'system', text: t(lang, 'botany.species_not_found') }],
      candidates: [],
      requestedDetails: [],
      imageIssues: [],
      notices: detectRiskTopics(question).includes('ingestion') ? [notice(lang, 'notice.no_consumption', 'danger')] : [],
    };
  }

  const candidates: Candidate[] = [];
  for (const record of records) candidates.push(await toCandidate(deps.catalogue, record, candidates.length + 1, lang));
  const notices = baseNotices(candidates, lang, false);
  const blocks: TextBlock[] = [{ provenance: 'catalogue', text: t(lang, 'botany.species_intro') }];
  const explanation = await explain(deps.llm, candidates, question, lang, notices, request.onToken);
  if (explanation) blocks.push(explanation);

  return {
    kind: 'botanical',
    status: 'species_info',
    blocks,
    candidates,
    requestedDetails: [],
    imageIssues: [],
    notices,
  };
}
