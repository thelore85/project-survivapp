import type { Catalogue } from './botany/catalogue';
import { describeSpecies, identifyFromPhoto } from './botany/service';
import type { ConversationStore, SessionState, StoredMessage } from './conversations';
import { t } from './i18n';
import type { LibraryStore } from './library/store';
import type { ModelProvider } from './models';
import type { LlmMessage } from './runtime/types';
import { answerSurvival } from './survival/service';
import { contentTokens, normalizeText } from './text/tokens';
import type { AnswerPart, AssistantReply, BotanicalAnswer, Domain, Lang, RgbaImage } from './types';

const BOTANY_SIGNAL =
  /\b(?:piant\w*|fung\w*|fogli\w*|fior\w*|alber\w*|bacc\w*|erb[ae]|specie|botanic\w*|plants?|mushrooms?|fungus|toadstools?|leaf|leaves|flowers?|trees?|berry|berries|herbs?|species|plantas?|hongos?|setas?|hojas?|flor|flores|arbol|arboles|bayas?|hierbas?|especies?)\b/;

const IDENTIFY_SIGNAL =
  /\b(?:identific\w*|riconosc\w*|reconoc\w*|recogniz\w*|recognis\w*|che (?:pianta|fungo)|what (?:plant|mushroom)|que (?:planta|seta|hongo))\b/;

const SURVIVAL_SIGNAL =
  /\b(?:sopravviv\w*|survival|survive|superviven\w*|sobreviv\w*|acqua|water|agua|fuoco|fire|fuego|ripar[oi]|rifugi\w*|shelters?|refugios?|soccors\w*|first aid|auxilios|ferit\w*|wounds?|herid\w*|nod[oi]|knots?|nudos?|orientament\w*|orientarmi|navigat\w*|orientacion|orientarme|bussola|compass|brujula|segnal\w*|signal\w*|senal\w*|trappol\w*|traps?|trampas?|ipotermi\w*|hypothermi\w*|hipotermi\w*|manual\w*|freddo|cold|frio|neve|snow|nieve|bivacc\w*|accend\w*|purific\w*|purify\w*|emergenz\w*|emergenc\w*|rescue\w*|rescate\w*|disidrat\w*|dehydrat\w*|deshidrat\w*|caccia\w*|hunt\w*|cazar|pesca\w*|fishing|cibo|food|comida|frattur\w*|fractur\w*|ustion\w*|burns?|quemadur\w*|emorragi\w*|bleed\w*|hemorragi\w*|mors[oi]|bites?|mordedura\w*)\b/;

const GENERAL_SIGNAL =
  /^(?:ciao|salve|buongiorno|buonasera|hello|hi|hey|hola|buenas|buenos dias|grazie|thanks|thank you|gracias)\b|\b(?:cosa (?:sai|puoi) fare|what can you do|que puedes hacer|come funzion\w*|how do(?:es)? (?:you|this|it) work|como funcionas?|chi sei|who are you|quien eres)\b/;

export interface IntentSignals {
  hasImage: boolean;
  /** Il testo nomina una specie presente nel catalogo. */
  mentionsSpecies: boolean;
  state: SessionState;
}

export interface Intent {
  domain: Domain;
  reason: string;
  /** Per il dominio botanico senza foto: serve una foto prima di poter rispondere. */
  needsImage?: boolean;
  /** La domanda fa riferimento al contesto della conversazione. */
  usesContext?: boolean;
}

/**
 * Classificazione deterministica dell'intento: regole e segnali espliciti, nessun modello.
 * È una funzione pura, così il set di test del routing la verifica senza database né modelli.
 */
export function classifyIntent(text: string, signals: IntentSignals): Intent {
  const normalized = normalizeText(text);
  const botany = BOTANY_SIGNAL.test(normalized) || signals.mentionsSpecies;
  const identify = IDENTIFY_SIGNAL.test(normalized);
  const survival = SURVIVAL_SIGNAL.test(normalized);
  const hasContext = (signals.state.lastSpeciesIds?.length ?? 0) > 0;

  if (signals.hasImage) {
    return survival
      ? { domain: 'mixed', reason: 'image+survival_keywords' }
      : { domain: 'botanical', reason: 'image' };
  }
  if ((botany || identify) && survival) return { domain: 'mixed', reason: 'botany+survival_keywords' };
  if (botany || identify) {
    if (!signals.mentionsSpecies && !hasContext && identify) {
      return { domain: 'botanical', reason: 'identify_without_image', needsImage: true };
    }
    return { domain: 'botanical', reason: signals.mentionsSpecies ? 'species_name' : 'botany_keywords', usesContext: hasContext };
  }
  if (survival) return { domain: 'survival', reason: 'survival_keywords' };
  if (GENERAL_SIGNAL.test(normalized)) return { domain: 'general', reason: 'greeting_or_help' };

  // Nessun segnale nel testo: una domanda breve dopo una risposta continua lo stesso argomento.
  const tokens = contentTokens(text).length;
  if (signals.state.lastDomain && tokens > 0 && tokens <= 8) {
    return { domain: signals.state.lastDomain, reason: 'follow_up', usesContext: true };
  }
  return { domain: 'clarification_required', reason: 'no_signal' };
}

export interface OrchestratorDeps {
  conversations: ConversationStore;
  catalogue: Catalogue;
  /** Archivi di documenti: pacchetto base e file dell'utente. */
  stores: LibraryStore[];
  models: ModelProvider;
}

export interface TurnInput {
  conversationId: string;
  text: string;
  lang: Lang;
  image?: { pixels: RgbaImage; ref?: string | null };
  onToken?: (token: string) => void;
}

const HISTORY_MESSAGES = 4;
const HISTORY_CHARS = 500;

function toHistory(messages: StoredMessage[]): LlmMessage[] {
  const history: LlmMessage[] = [];
  for (const message of messages.slice(-HISTORY_MESSAGES)) {
    if (message.role === 'user') {
      if (message.text) history.push({ role: 'user', content: message.text.slice(0, HISTORY_CHARS) });
    } else {
      const text = message.reply.parts
        .flatMap((part) => part.blocks)
        .filter((block) => block.provenance === 'generated')
        .map((block) => block.text)
        .join('\n');
      if (text) history.push({ role: 'assistant', content: text.slice(0, HISTORY_CHARS) });
    }
  }
  return history;
}

/**
 * Punto d'ingresso della chat: classifica, invoca al massimo due moduli in sequenza,
 * conserva la provenienza dei risultati e aggiorna lo stato della sessione.
 */
export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async handle(input: TurnInput): Promise<AssistantReply> {
    const { conversations } = this.deps;
    const { conversationId, lang } = input;
    if (!(await conversations.exists(conversationId))) {
      await conversations.create(conversationId, input.text.trim().slice(0, 48) || '📷');
    }
    const previous = await conversations.messages(conversationId);
    const state = await conversations.getState(conversationId);
    await conversations.append(conversationId, { role: 'user', text: input.text, imageRef: input.image?.ref ?? null });

    // Risposta a una richiesta di chiarimento: riprende la domanda rimasta in sospeso.
    let text = input.text;
    let intent = classifyIntent(text, await this.signals(text, input.image !== undefined, state));
    if (state.pendingQuestion && (intent.domain === 'botanical' || intent.domain === 'survival')) {
      if (contentTokens(text).length <= 4) {
        text = state.pendingQuestion;
        intent = { domain: intent.domain, reason: `clarified:${intent.reason}`, usesContext: intent.usesContext };
      }
    }

    const nextState: SessionState = { ...state };
    delete nextState.pendingQuestion;
    const parts: AnswerPart[] = [];
    const startedAt = Date.now();
    const partsMs: number[] = [];
    let partStartedAt = startedAt;
    const mark = (): void => {
      partsMs.push(Date.now() - partStartedAt);
      partStartedAt = Date.now();
    };
    const history = toHistory(previous);

    if (intent.domain === 'clarification_required') {
      nextState.pendingQuestion = input.text;
      parts.push({
        kind: 'clarification',
        blocks: [{ provenance: 'system', text: t(lang, 'clarify.question') }],
        options: [
          { domain: 'botanical', label: t(lang, 'clarify.option.botanical') },
          { domain: 'survival', label: t(lang, 'clarify.option.survival') },
        ],
        notices: [],
      });
    } else if (intent.domain === 'general') {
      parts.push({ kind: 'general', blocks: [{ provenance: 'system', text: t(lang, 'general.help') }], notices: [] });
    } else if (intent.needsImage) {
      parts.push({
        kind: 'clarification',
        blocks: [{ provenance: 'system', text: t(lang, 'clarify.need_image') }],
        options: [],
        notices: [],
      });
    } else {
      let botanical: BotanicalAnswer | null = null;
      if (intent.domain === 'botanical' || intent.domain === 'mixed') {
        botanical = await this.runBotanical(input, text, state, intent);
        parts.push(botanical);
        mark();
        if (botanical.candidates.length > 0) {
          nextState.lastDomain = 'botanical';
          nextState.lastSpeciesIds = botanical.candidates.map((candidate) => candidate.id);
        }
      }
      if (intent.domain === 'survival' || intent.domain === 'mixed') {
        // Composizione sequenziale e limitata: il secondo modulo riceve solo i nomi dei candidati.
        const context =
          botanical && botanical.candidates.length > 0
            ? botanical.candidates.map((candidate) => candidate.scientificName).join(', ')
            : undefined;
        parts.push(
          await answerSurvival(
            {
              stores: this.deps.stores,
              embedder: await this.deps.models.textEmbedder(),
              llm: await this.deps.models.llm(),
            },
            { question: text, lang, history, context, onToken: input.onToken },
          ),
        );
        mark();
        if (intent.domain === 'survival') nextState.lastDomain = 'survival';
      }
    }

    const reply: AssistantReply = {
      domain: intent.needsImage ? 'clarification_required' : intent.domain,
      routingReason: intent.reason,
      parts,
      timings: { totalMs: Date.now() - startedAt, partsMs },
    };
    await conversations.append(conversationId, { role: 'assistant', reply });
    await conversations.setState(conversationId, nextState);
    return reply;
  }

  private async signals(text: string, hasImage: boolean, state: SessionState): Promise<IntentSignals> {
    const mentioned = text.trim() ? await this.deps.catalogue.findMentioned(text) : [];
    return { hasImage, mentionsSpecies: mentioned.length > 0, state };
  }

  private async runBotanical(input: TurnInput, text: string, state: SessionState, intent: Intent): Promise<BotanicalAnswer> {
    const { catalogue, models } = this.deps;
    if (input.image) {
      const normalized = normalizeText(text);
      const kind = /\b(?:fung\w*|mushrooms?|hongos?|setas?)\b/.test(normalized)
        ? 'fungus'
        : /\b(?:piant\w*|plants?|plantas?|alber\w*|trees?|arbol\w*|fior\w*|flowers?|flor\w*)\b/.test(normalized)
          ? 'plant'
          : undefined;
      return identifyFromPhoto(
        { catalogue, vision: await models.vision(), llm: await models.llm() },
        { image: input.image.pixels, lang: input.lang, kind, question: text, onToken: input.onToken },
      );
    }
    return describeSpecies(
      { catalogue, vision: null, llm: await models.llm() },
      {
        question: text,
        lang: input.lang,
        speciesIds: intent.usesContext ? state.lastSpeciesIds : undefined,
        onToken: input.onToken,
      },
    );
  }
}
