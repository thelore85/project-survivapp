import { LANGS, redactEdibilityClaims, t } from '@survivapp/core';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { useApp } from '../state/store';
import { tr } from '../strings';
import { ToxicityBadge } from './Answer';
import { Badge, Button, Section, Text } from './ui';

/** Scheda completa di una specie del catalogo, con fonti e licenze. */
export function SpeciesModal() {
  const species = useApp((state) => state.species);
  const lang = useApp((state) => state.lang);
  const services = useApp((state) => state.services);
  const showSpecies = useApp((state) => state.showSpecies);
  const [lookalikes, setLookalikes] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let active = true;
    if (!species || !services) {
      setLookalikes([]);
      return;
    }
    void services.catalogue.getMany(species.lookalikes).then((records) => {
      if (active) {
        setLookalikes(
          records.map((record) => ({ id: record.id, name: record.commonNames[lang]?.[0] ?? record.scientificName })),
        );
      }
    });
    return () => {
      active = false;
    };
  }, [species, services, lang]);

  if (!species || !services) return null;
  const image = species.images[0];
  const rawDescription = species.descriptions[lang] ?? species.descriptions.en;
  // Stessa regola delle risposte: una scheda non afferma mai commestibilità.
  const description = rawDescription ? redactEdibilityClaims(rawDescription) : '';
  const note = species.toxicity.note?.[lang] ?? species.toxicity.note?.en;
  const names = LANGS.flatMap((code) => (species.commonNames[code] ?? []).map((name) => `${name} (${code})`));
  const features = Object.entries(species.features);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={() => void showSpecies(null)}>
      <View className="flex-1 items-center justify-end bg-black/50 md:justify-center">
        <View className="max-h-[92%] w-full max-w-2xl rounded-t-2xl bg-background md:rounded-2xl">
          <ScrollView contentContainerClassName="gap-5 p-5">
            {image ? (
              <View className="gap-1">
                <Image
                  source={{ uri: services.platform.imageUri(image.file) }}
                  accessibilityLabel={species.scientificName}
                  className="h-56 w-full rounded-xl bg-muted"
                  resizeMode="cover"
                />
                <Text variant="muted" className="text-xs">
                  {tr(lang, 'species.photo_credit')}: {image.attribution} · {image.license}
                </Text>
              </View>
            ) : null}

            <View className="gap-2">
              <Text variant="title">{species.commonNames[lang]?.[0] ?? species.scientificName}</Text>
              <Text variant="muted" className="italic">
                {species.scientificName}
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                <Badge label={tr(lang, species.kind === 'fungus' ? 'species.fungus' : 'species.plant')} />
                {species.taxonomy.family ? <Badge label={`${tr(lang, 'species.family')}: ${species.taxonomy.family}`} /> : null}
                <ToxicityBadge level={species.toxicity.level} lang={lang} />
              </View>
              {note ? (
                <View accessibilityRole="alert" className="rounded-lg border border-danger bg-danger-soft px-3 py-2">
                  <Text variant="small" className="font-medium text-danger">
                    {note}
                  </Text>
                </View>
              ) : null}
            </View>

            <Section title={tr(lang, 'species.description')}>
              <Text selectable>{description || tr(lang, 'species.no_description')}</Text>
            </Section>

            {lookalikes.length > 0 ? (
              <Section title={tr(lang, 'answer.lookalikes')}>
                <View className="flex-row flex-wrap gap-2">
                  {lookalikes.map((lookalike) => (
                    <Pressable key={lookalike.id} accessibilityRole="button" onPress={() => void showSpecies(lookalike.id)}>
                      <Badge tone="warning" label={lookalike.name} />
                    </Pressable>
                  ))}
                </View>
              </Section>
            ) : null}

            {features.length > 0 ? (
              <Section title={tr(lang, 'species.features')}>
                {features.map(([name, value]) => (
                  <Text key={name} variant="small">
                    • {name}: {value}
                  </Text>
                ))}
              </Section>
            ) : null}

            {names.length > 0 ? (
              <Section title={tr(lang, 'species.names')}>
                <Text variant="small">{names.join(' · ')}</Text>
              </Section>
            ) : null}

            <Section title={tr(lang, 'species.sources')}>
              {species.sources.map((source) => (
                <Text key={source.url} variant="muted" selectable>
                  {source.name} · {source.license}
                  {'\n'}
                  {source.url}
                </Text>
              ))}
            </Section>

            <View accessibilityRole="alert" className="gap-1 rounded-lg border border-danger bg-danger-soft px-3 py-2">
              <Text variant="small" className="font-medium text-danger">
                {t(lang, 'notice.no_consumption')}
              </Text>
              <Text variant="small" className="text-danger">
                {t(lang, 'notice.no_warning_not_safe')}
              </Text>
            </View>

            <Button label={tr(lang, 'species.close')} variant="outline" onPress={() => void showSpecies(null)} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
