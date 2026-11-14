import { t } from '../i18n';
import { hybridSearch, isRelevant } from '../library/search';
import type { LibraryStore } from '../library/store';
import type { LlmMessage, LlmRuntime, TextEmbedder } from '../runtime/types';
import { buildContextBlock, DATA_NOT_INSTRUCTIONS_RULE } from '../safety/context';
import {
  detectRiskTopics,
  findUnsupportedQuantities,
  findViolations,
  riskNotices,
  validateCitations,
} from '../safety/policy';
import type { Citation, Lang, Notice, Passage, SurvivalAnswer, TextBlock } from '../types';

export interface SurvivalDeps {
  stores: LibraryStore[];
  embedder: TextEmbedder | null;
  llm: LlmRuntime | null;
}

export interface SurvivalRequest {
  question: string;
  lang: Lang;
  /** Ultimi scambi della conversazione, già limitati dall'orchestratore. */
  history?: LlmMessage[];
  /** Contesto esplicito passato dall'orchestratore, es. la specie appena identificata. */
  context?: string;
  onToken?: (token: string) => void;
}

const LANGUAGE_NAME: Record<Lang, string> = { it: 'Italian', en: 'English', es: 'Spanish' };
const CONFLICT_MARKER = '[[CONFLICT]]';

function systemPrompt(lang: Lang): string {
  return [
    'You answer questions about outdoor survival using only the numbered sources provided by the user message.',
    DATA_NOT_INSTRUCTIONS_RULE,
    'Cite the source of every statement with its number in square brackets, e.g. [1].',
    'Never state a quantity, dosage, time or temperature that is not written in the sources.',
    'Never say that a plant or mushroom is edible or safe to eat.',
    `If the sources contradict each other, start your answer with ${CONFLICT_MARKER} and describe the disagreement.`,
    'If the sources do not answer the question, say so instead of guessing.',
    `Answer in ${LANGUAGE_NAME[lang]}, briefly.`,
  ].join('\n');
}

function toCitation(passage: Passage, marker: number): Citation {
  return {
    marker,
    documentId: passage.documentId,
    documentTitle: passage.documentTitle,
    page: passage.page,
    section: passage.section,
    reliability: passage.reliability,
    excerpt: passage.text,
  };
}

/** Risposta survival ancorata alle fonti locali: recupera, genera, poi verifica ciò che è stato generato. */
export async function answerSurvival(deps: SurvivalDeps, request: SurvivalRequest): Promise<SurvivalAnswer> {
  const { question, lang } = request;
  const topics = detectRiskTopics(`${question} ${request.context ?? ''}`);
  const notices: Notice[] = riskNotices(topics, lang);
  const addNotice = (code: Parameters<typeof t>[1], level: Notice['level']): void => {
    if (!notices.some((notice) => notice.code === code)) notices.push({ code, level, text: t(lang, code) });
  };

  const searchText = request.context ? `${question} ${request.context}` : question;
  const search = await hybridSearch(deps.stores, deps.embedder, searchText, {
    limit: 6,
    // I testi storici non devono mai sostenere una risposta su cosa si può ingerire.
    excludeHistorical: topics.includes('ingestion'),
  });
  if (!search.semanticUsed) addNotice('notice.semantic_unavailable', 'info');

  const relevant = search.passages.filter((passage) => isRelevant(passage, searchText, deps.embedder));
  if (relevant.length === 0) {
    return {
      kind: 'survival',
      status: 'insufficient_sources',
      blocks: [{ provenance: 'system', text: t(lang, 'survival.insufficient') }],
      citations: [],
      notices,
      highRiskTopics: topics,
    };
  }

  const all = relevant.map((passage, index) => toCitation(passage, index + 1));
  if (all.some((citation) => citation.reliability === 'historical')) addNotice('notice.historical_source', 'warning');
  addNotice('notice.context_dependent', 'info');

  const extractive = (): SurvivalAnswer => ({
    kind: 'survival',
    status: 'extractive',
    blocks: [{ provenance: 'documents', text: t(lang, 'survival.extractive_intro') }],
    citations: all,
    notices,
    highRiskTopics: topics,
  });

  if (!deps.llm) return extractive();

  const context = buildContextBlock(
    all.map((citation) => ({
      marker: citation.marker,
      header: `${citation.documentTitle}${citation.page ? `, p. ${citation.page}` : ''}`,
      text: citation.excerpt,
    })),
  );
  const generated = await deps.llm.generate(
    {
      system: systemPrompt(lang),
      messages: [...(request.history ?? []), { role: 'user', content: `${context}\n\nQuestion: ${question}` }],
      maxTokens: 400,
    },
    request.onToken,
  );

  const hasConflict = generated.includes(CONFLICT_MARKER);
  const validated = validateCitations(generated.replace(CONFLICT_MARKER, '').trim(), new Set(all.map((c) => c.marker)));
  const unsupported = findUnsupportedQuantities(
    validated.text,
    all.map((citation) => citation.excerpt),
  );
  const violations = findViolations(validated.text, 'survival');

  // Testo senza fonti, con quantità non presenti nelle fonti o con un via libera al consumo:
  // si scarta e restano i passaggi originali.
  if (validated.cited.length === 0 || unsupported.length > 0 || violations.length > 0) {
    if (violations.length > 0) addNotice('notice.no_consumption', 'danger');
    addNotice('notice.generated_removed', 'info');
    return extractive();
  }

  if (hasConflict) addNotice('notice.conflicting_sources', 'warning');
  const blocks: TextBlock[] = [{ provenance: 'generated', text: validated.text }];
  return {
    kind: 'survival',
    status: 'answered',
    blocks,
    citations: all.filter((citation) => validated.cited.includes(citation.marker)),
    notices,
    highRiskTopics: topics,
  };
}
