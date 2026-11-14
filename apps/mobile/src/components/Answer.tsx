import type {
  AnswerPart,
  BotanicalAnswer,
  Candidate,
  Citation,
  Lang,
  Notice,
  Provenance,
  SurvivalAnswer,
  TextBlock,
  ToxicityLevel,
} from '@survivapp/core';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useApp } from '../state/store';
import { tr, type StringKey } from '../strings';
import { Badge, Button, Card, Text, cn } from './ui';

const PROVENANCE_TONE: Record<Provenance, 'primary' | 'info' | 'warning' | 'neutral'> = {
  catalogue: 'primary',
  documents: 'info',
  generated: 'warning',
  system: 'neutral',
};

/** Etichetta che dice da dove arriva un testo: catalogo, documenti, modello o sistema. */
export function ProvenanceBadge({ provenance, lang }: { provenance: Provenance; lang: Lang }) {
  return <Badge tone={PROVENANCE_TONE[provenance]} label={tr(lang, `provenance.${provenance}` as StringKey)} />;
}

function Blocks({ blocks, lang }: { blocks: TextBlock[]; lang: Lang }) {
  return (
    <View className="gap-3">
      {blocks.map((block, index) => (
        <View key={index} className="gap-1.5">
          <ProvenanceBadge provenance={block.provenance} lang={lang} />
          <Text selectable>{block.text}</Text>
        </View>
      ))}
    </View>
  );
}

const NOTICE_STYLE: Record<Notice['level'], { box: string; text: string }> = {
  danger: { box: 'border-danger bg-danger-soft', text: 'text-danger' },
  warning: { box: 'border-warning bg-warning-soft', text: 'text-warning' },
  info: { box: 'border-border bg-muted', text: 'text-muted-foreground' },
};

function Notices({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;
  return (
    <View className="gap-2">
      {notices.map((notice) => (
        <View
          key={notice.code}
          accessibilityRole="alert"
          className={cn('rounded-lg border px-3 py-2', NOTICE_STYLE[notice.level].box)}
        >
          <Text variant="small" className={cn('font-medium', NOTICE_STYLE[notice.level].text)}>
            {notice.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

function CitationItem({ citation, lang }: { citation: Citation; lang: Lang }) {
  const [open, setOpen] = useState(false);
  return (
    <View className="rounded-lg border border-border px-3 py-2">
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} className="gap-1">
        <Text variant="small" className="font-semibold">
          [{citation.marker}] {citation.documentTitle}
          {citation.page ? ` · ${tr(lang, 'answer.page', { page: citation.page })}` : ''}
        </Text>
        {citation.section ? <Text variant="muted">{citation.section}</Text> : null}
        <View className="flex-row flex-wrap items-center gap-2">
          {citation.reliability === 'historical' ? <Badge tone="warning" label={tr(lang, 'answer.historical')} /> : null}
          <Text variant="muted" className="text-primary">
            {tr(lang, open ? 'answer.hide' : 'answer.show')}
          </Text>
        </View>
      </Pressable>
      {open ? (
        <Text variant="small" selectable className="mt-2 text-muted-foreground">
          {citation.excerpt}
        </Text>
      ) : null}
    </View>
  );
}

function SurvivalView({ answer, lang }: { answer: SurvivalAnswer; lang: Lang }) {
  return (
    <View className="gap-4">
      <Notices notices={answer.notices.filter((notice) => notice.level !== 'info')} />
      <Blocks blocks={answer.blocks} lang={lang} />
      {answer.citations.length > 0 ? (
        <View className="gap-2">
          <Text variant="label">{tr(lang, 'answer.sources')}</Text>
          {answer.citations.map((citation) => (
            <CitationItem key={citation.marker} citation={citation} lang={lang} />
          ))}
        </View>
      ) : null}
      <Notices notices={answer.notices.filter((notice) => notice.level === 'info')} />
    </View>
  );
}

const TOXICITY_TONE: Record<ToxicityLevel, 'danger' | 'warning' | 'neutral'> = {
  deadly: 'danger',
  toxic: 'danger',
  caution: 'warning',
  none_recorded: 'neutral',
};

export function ToxicityBadge({ level, lang }: { level: ToxicityLevel; lang: Lang }) {
  return <Badge tone={TOXICITY_TONE[level]} label={tr(lang, `tox.${level}` as StringKey)} />;
}

function CandidateCard({ candidate, lang }: { candidate: Candidate; lang: Lang }) {
  const imageUri = useApp((state) => state.services?.platform.imageUri);
  const showSpecies = useApp((state) => state.showSpecies);
  return (
    <Card className="gap-3 p-3">
      <View className="flex-row gap-3">
        {candidate.image && imageUri ? (
          <Image
            source={{ uri: imageUri(candidate.image.file) }}
            accessibilityLabel={candidate.scientificName}
            className="h-20 w-20 rounded-lg bg-muted"
          />
        ) : (
          <View className="h-20 w-20 rounded-lg bg-muted" />
        )}
        <View className="flex-1 gap-1">
          <Text variant="heading">
            {candidate.rank}. {candidate.commonName ?? candidate.scientificName}
          </Text>
          <Text variant="muted" className="italic">
            {candidate.scientificName}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            <Badge label={tr(lang, candidate.kind === 'fungus' ? 'species.fungus' : 'species.plant')} />
            <ToxicityBadge level={candidate.toxicity} lang={lang} />
          </View>
        </View>
      </View>
      {candidate.toxicityNote ? (
        <Text variant="small" className="font-medium text-danger">
          {candidate.toxicityNote}
        </Text>
      ) : null}
      {candidate.lookalikes.length > 0 ? (
        <View className="gap-1">
          <Text variant="label">{tr(lang, 'answer.lookalikes')}</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {candidate.lookalikes.map((lookalike) => (
              <Pressable key={lookalike.id} accessibilityRole="button" onPress={() => void showSpecies(lookalike.id)}>
                <Badge
                  tone={TOXICITY_TONE[lookalike.toxicity]}
                  label={`${lookalike.commonName ?? lookalike.scientificName} · ${tr(lang, `tox.${lookalike.toxicity}` as StringKey)}`}
                />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <Button variant="outline" size="sm" label={tr(lang, 'answer.open_card')} onPress={() => void showSpecies(candidate.id)} />
    </Card>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View className="gap-1">
      <Text variant="label">{title}</Text>
      {items.map((item) => (
        <Text key={item} variant="small">
          • {item}
        </Text>
      ))}
    </View>
  );
}

function BotanicalView({ answer, lang }: { answer: BotanicalAnswer; lang: Lang }) {
  return (
    <View className="gap-4">
      <Notices notices={answer.notices.filter((notice) => notice.level !== 'info')} />
      <Blocks blocks={answer.blocks} lang={lang} />
      <BulletList title={tr(lang, 'answer.issues')} items={answer.imageIssues} />
      {answer.candidates.length > 0 ? (
        <View className="gap-2">
          <Text variant="label">{tr(lang, 'answer.candidates')}</Text>
          {answer.candidates.map((candidate) => (
            <CandidateCard key={candidate.id} candidate={candidate} lang={lang} />
          ))}
        </View>
      ) : null}
      <BulletList title={tr(lang, 'answer.details')} items={answer.requestedDetails} />
      <Notices notices={answer.notices.filter((notice) => notice.level === 'info')} />
    </View>
  );
}

/** Una parte della risposta dell'assistente: ogni dominio ha la sua vista, tutte dichiarano la provenienza. */
export function AnswerPartView({ part, lang, onOption }: { part: AnswerPart; lang: Lang; onOption: (label: string) => void }) {
  switch (part.kind) {
    case 'survival':
      return <SurvivalView answer={part} lang={lang} />;
    case 'botanical':
      return <BotanicalView answer={part} lang={lang} />;
    case 'general':
      return <Blocks blocks={part.blocks} lang={lang} />;
    case 'clarification':
      return (
        <View className="gap-3">
          <Blocks blocks={part.blocks} lang={lang} />
          <View className="flex-row flex-wrap gap-2">
            {part.options.map((option) => (
              <Button key={option.domain} variant="outline" size="sm" label={option.label} onPress={() => onOption(option.label)} />
            ))}
          </View>
        </View>
      );
  }
}
