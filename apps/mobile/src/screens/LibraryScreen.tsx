import { summarize, type DocumentInfo, type SpeciesSummary } from '@survivapp/core';
import { FileUp, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { ToxicityBadge } from '../components/Answer';
import { Badge, Button, Card, Section, Text } from '../components/ui';
import { useIconColor } from '../components/useIconColor';
import { useApp } from '../state/store';
import { tr } from '../strings';

const MB = 1024 * 1024;

function DocumentRow({ document, onRemove }: { document: DocumentInfo; onRemove?: () => void }) {
  const lang = useApp((state) => state.lang);
  const iconColor = useIconColor();
  return (
    <View className="flex-row items-center gap-3 border-b border-border py-2">
      <View className="flex-1 gap-1">
        <Text variant="small" className="font-medium">
          {document.title}
        </Text>
        <Text variant="muted" className="text-xs">
          {[document.author, document.edition].filter(Boolean).join(' · ')}
          {document.author || document.edition ? ' · ' : ''}
          {tr(lang, 'library.doc.meta', { pages: document.pageCount ?? 0, chunks: document.chunkCount })}
        </Text>
        <View className="flex-row flex-wrap gap-1.5">
          {document.reliability === 'historical' ? <Badge tone="warning" label={tr(lang, 'answer.historical')} /> : null}
          {document.indexStatus === 'indexed_text_only' ? <Badge label={tr(lang, 'library.doc.text_only')} /> : null}
          {document.license ? <Badge label={document.license} /> : null}
        </View>
      </View>
      {onRemove ? (
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel={`${tr(lang, 'library.user.remove')}: ${document.title}`}
          icon={<Trash2 size={18} color={iconColor} />}
          onPress={onRemove}
        />
      ) : null}
    </View>
  );
}

function CatalogueBrowser() {
  const lang = useApp((state) => state.lang);
  const services = useApp((state) => state.services);
  const showSpecies = useApp((state) => state.showSpecies);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState<SpeciesSummary[]>([]);

  useEffect(() => {
    let active = true;
    void services?.catalogue.list().then((records) => {
      if (active) setAll(records.map((record) => summarize(record, lang)));
    });
    return () => {
      active = false;
    };
  }, [services, lang]);

  const needle = query.trim().toLowerCase();
  const visible = (needle
    ? all.filter((item) => `${item.scientificName} ${item.commonName ?? ''}`.toLowerCase().includes(needle))
    : all
  ).slice(0, 60);

  return (
    <View className="gap-2">
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={tr(lang, 'library.catalogue.search')}
        placeholderTextColor="#8a8f8a"
        accessibilityLabel={tr(lang, 'library.catalogue.search')}
        className="min-h-[44px] rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground"
      />
      {visible.length === 0 ? <Text variant="muted">{tr(lang, 'library.catalogue.empty')}</Text> : null}
      {visible.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          className="min-h-[44px] flex-row items-center justify-between gap-3 border-b border-border py-2"
          onPress={() => void showSpecies(item.id)}
        >
          <View className="flex-1">
            <Text variant="small" className="font-medium">
              {item.commonName ?? item.scientificName}
            </Text>
            <Text variant="muted" className="text-xs italic">
              {item.scientificName}
            </Text>
          </View>
          <ToxicityBadge level={item.toxicity} lang={lang} />
        </Pressable>
      ))}
    </View>
  );
}

/** Libreria: pacchetto base in sola lettura, file dell'utente con quota, catalogo delle specie. */
export function LibraryScreen() {
  const lang = useApp((state) => state.lang);
  const services = useApp((state) => state.services);
  const config = useApp((state) => state.config);
  const baseDocuments = useApp((state) => state.baseDocuments);
  const userDocuments = useApp((state) => state.userDocuments);
  const usedBytes = useApp((state) => state.usedBytes);
  const importing = useApp((state) => state.importing);
  const feedback = useApp((state) => state.libraryFeedback);
  const importFile = useApp((state) => state.importFile);
  const removeFile = useApp((state) => state.removeFile);
  const manifest = services?.platform.manifest;
  const quota = config?.userQuotaMb ?? 0;
  const usedMb = usedBytes / MB;
  const ratio = quota > 0 ? Math.min(1, usedMb / quota) : 0;

  return (
    <ScrollView className="flex-1" contentContainerClassName="mx-auto w-full max-w-3xl gap-6 p-4">
      <Section title={tr(lang, 'library.user')}>
        <Card className="gap-3">
          <Text variant="muted">{tr(lang, 'library.user.limits', { max: config?.maxUserFileMb ?? 0 })}</Text>
          <View className="gap-1">
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <View className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(ratio * 100)}%` }} />
            </View>
            <Text variant="muted" className="text-xs">
              {tr(lang, 'library.user.usage', { used: usedMb.toFixed(usedMb < 10 ? 1 : 0), quota })}
            </Text>
          </View>
          <Button
            label={tr(lang, importing ? 'library.user.importing' : 'library.user.import')}
            icon={<FileUp size={18} color="#ffffff" />}
            loading={importing}
            onPress={() => void importFile()}
          />
          {feedback ? (
            <View
              accessibilityRole="alert"
              className={
                feedback.kind === 'error'
                  ? 'rounded-lg border border-danger bg-danger-soft px-3 py-2'
                  : 'rounded-lg border border-border bg-accent px-3 py-2'
              }
            >
              <Text variant="small" className={feedback.kind === 'error' ? 'text-danger' : 'text-primary'}>
                {feedback.text}
              </Text>
            </View>
          ) : null}
          {userDocuments.length === 0 ? <Text variant="muted">{tr(lang, 'library.user.empty')}</Text> : null}
          {userDocuments.map((document) => (
            <DocumentRow key={document.id} document={document} onRemove={() => void removeFile(document.id)} />
          ))}
        </Card>
      </Section>

      <Section title={tr(lang, 'library.package')}>
        <Card className="gap-2">
          {manifest ? (
            <>
              <Text variant="heading">
                {manifest.id} · {manifest.version}
              </Text>
              <Text variant="muted">{tr(lang, 'library.package.readonly')}</Text>
              <Text variant="muted">{tr(lang, 'library.package.stats', manifest.stats)}</Text>
            </>
          ) : (
            <Text variant="muted">{tr(lang, 'app.no_package')}</Text>
          )}
          {baseDocuments.map((document) => (
            <DocumentRow key={document.id} document={document} />
          ))}
        </Card>
      </Section>

      <Section title={tr(lang, 'library.catalogue')}>
        <Card>
          <CatalogueBrowser />
        </Card>
      </Section>
    </ScrollView>
  );
}
