export type Lang = 'it' | 'en' | 'es';
export const LANGS: readonly Lang[] = ['it', 'en', 'es'];

export type Domain = 'botanical' | 'survival' | 'general' | 'mixed' | 'clarification_required';

/** Da dove arriva un contenuto mostrato all'utente: la UI lo deve rendere evidente. */
export type Provenance = 'catalogue' | 'documents' | 'generated' | 'system';

export type NoticeLevel = 'info' | 'warning' | 'danger';

export interface Notice {
  code: string;
  level: NoticeLevel;
  text: string;
}

/** Immagine decodificata: i runtime di visione e i controlli qualità lavorano sui pixel. */
export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, 4 byte per pixel. */
  data: Uint8Array | Uint8ClampedArray;
}

export type Reliability = 'current' | 'historical';

export interface Passage {
  store: string;
  chunkId: number;
  documentId: string;
  documentTitle: string;
  reliability: Reliability;
  page: number | null;
  section: string | null;
  text: string;
  /** Similarità coseno con la domanda, se la ricerca semantica era disponibile. */
  cosine: number | null;
  /** Quota dei termini della domanda presenti nel passaggio (0..1). */
  termCoverage: number;
  score: number;
}

export interface Citation {
  /** Numero usato nel testo, es. [1]. */
  marker: number;
  documentId: string;
  documentTitle: string;
  page: number | null;
  section: string | null;
  reliability: Reliability;
  excerpt: string;
}

export interface TextBlock {
  provenance: Provenance;
  text: string;
}

export interface SurvivalAnswer {
  kind: 'survival';
  status: 'answered' | 'extractive' | 'insufficient_sources';
  blocks: TextBlock[];
  citations: Citation[];
  notices: Notice[];
  highRiskTopics: string[];
}

export type ToxicityLevel = 'deadly' | 'toxic' | 'caution' | 'none_recorded';

export interface SourceRef {
  name: string;
  url: string;
  license: string;
}

export interface SpeciesImage {
  file: string;
  license: string;
  attribution: string;
  sourceUrl: string;
}

export interface SpeciesRecord {
  id: string;
  scientificName: string;
  kind: 'plant' | 'fungus';
  taxonomy: Record<string, string>;
  gbifKey?: number | null;
  commonNames: Record<Lang, string[]>;
  descriptions: Partial<Record<Lang, string>>;
  features: Record<string, string>;
  toxicity: { level: ToxicityLevel; note: Partial<Record<Lang, string>> | null };
  lookalikes: string[];
  sources: SourceRef[];
  images: SpeciesImage[];
}

export interface SpeciesSummary {
  id: string;
  scientificName: string;
  commonName: string | null;
  kind: 'plant' | 'fungus';
  family: string | null;
  toxicity: ToxicityLevel;
  toxicityNote: string | null;
  image: SpeciesImage | null;
}

export interface Candidate extends SpeciesSummary {
  rank: number;
  description: string | null;
  /** Caratteristiche della scheda che la foto non permette di verificare. */
  featuresToVerify: { name: string; value: string }[];
  lookalikes: SpeciesSummary[];
  sources: SourceRef[];
}

export interface BotanicalAnswer {
  kind: 'botanical';
  status: 'candidates' | 'retake_photo' | 'no_candidates' | 'unavailable' | 'species_info';
  blocks: TextBlock[];
  candidates: Candidate[];
  /** Ulteriori foto o dettagli da chiedere all'utente. */
  requestedDetails: string[];
  imageIssues: string[];
  notices: Notice[];
}

export interface GeneralAnswer {
  kind: 'general';
  blocks: TextBlock[];
  notices: Notice[];
}

export interface ClarificationAnswer {
  kind: 'clarification';
  blocks: TextBlock[];
  options: { domain: 'botanical' | 'survival'; label: string }[];
  notices: Notice[];
}

export type AnswerPart = SurvivalAnswer | BotanicalAnswer | GeneralAnswer | ClarificationAnswer;

export interface AssistantReply {
  domain: Domain;
  /** Perché l'orchestratore ha scelto questo dominio: serve a diagnostica e test. */
  routingReason: string;
  parts: AnswerPart[];
  /** Durata del turno e di ciascuna parte, in millisecondi: serve ai benchmark sul dispositivo. */
  timings?: { totalMs: number; partsMs: number[] };
}
