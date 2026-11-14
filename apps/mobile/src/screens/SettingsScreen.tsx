import { LANGS, type Lang } from '@survivapp/core';
import { Minus, Plus } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { Badge, Button, Card, Section, Text } from '../components/ui';
import { useIconColor } from '../components/useIconColor';
import { useApp } from '../state/store';
import { tr, type StringKey } from '../strings';

const LANGUAGE_NAME: Record<Lang, string> = { it: 'Italiano', en: 'English', es: 'Español' };
const QUOTA_STEP = 50;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-border py-2">
      <Text variant="small">{label}</Text>
      <Text variant="muted" className="flex-shrink text-right">
        {value}
      </Text>
    </View>
  );
}

/** Impostazioni: lingua, quota dei file, stato dei modelli, risorse, dati personali. */
export function SettingsScreen() {
  const lang = useApp((state) => state.lang);
  const services = useApp((state) => state.services);
  const config = useApp((state) => state.config);
  const modelStatus = useApp((state) => state.modelStatus);
  const feedback = useApp((state) => state.settingsFeedback);
  const setLanguage = useApp((state) => state.setLanguage);
  const setQuota = useApp((state) => state.setQuota);
  const clearHistory = useApp((state) => state.clearHistory);
  const rebuildIndex = useApp((state) => state.rebuildIndex);
  const installPackage = useApp((state) => state.installPackage);
  const iconColor = useIconColor();
  if (!services || !config) return null;
  const manifest = services.platform.manifest;

  return (
    <ScrollView className="flex-1" contentContainerClassName="mx-auto w-full max-w-3xl gap-6 p-4">
      <Section title={tr(lang, 'settings.language')}>
        <View className="flex-row flex-wrap gap-2">
          {LANGS.map((code) => (
            <Button
              key={code}
              variant={code === lang ? 'default' : 'outline'}
              label={LANGUAGE_NAME[code]}
              accessibilityState={{ selected: code === lang }}
              onPress={() => void setLanguage(code)}
            />
          ))}
        </View>
      </Section>

      <Section title={tr(lang, 'settings.quota')}>
        <Card className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <Button
              variant="outline"
              size="icon"
              accessibilityLabel={`− ${QUOTA_STEP} MB`}
              icon={<Minus size={18} color={iconColor} />}
              disabled={config.userQuotaMb <= config.minUserQuotaMb}
              onPress={() => void setQuota(config.userQuotaMb - QUOTA_STEP)}
            />
            <Text variant="title" accessibilityLabel={`${config.userQuotaMb} MB`}>
              {config.userQuotaMb} MB
            </Text>
            <Button
              variant="outline"
              size="icon"
              accessibilityLabel={`+ ${QUOTA_STEP} MB`}
              icon={<Plus size={18} color={iconColor} />}
              disabled={config.userQuotaMb >= config.maxUserQuotaMb}
              onPress={() => void setQuota(config.userQuotaMb + QUOTA_STEP)}
            />
          </View>
          <Text variant="muted">
            {tr(lang, 'settings.quota.help', { min: config.minUserQuotaMb, max: config.maxUserQuotaMb })}
          </Text>
        </Card>
      </Section>

      <Section title={tr(lang, 'settings.models')}>
        <Card>
          {services.platform.demo ? <Badge tone="warning" label={tr(lang, 'app.demo')} className="mb-2" /> : null}
          {modelStatus.map((status) => (
            <Row
              key={status.role}
              label={`${tr(lang, `settings.model.${status.role}` as StringKey)} · ${status.id ?? '—'}`}
              value={tr(
                lang,
                !status.available ? 'settings.model.unavailable' : status.loaded ? 'settings.model.loaded' : 'settings.model.idle',
              )}
            />
          ))}
        </Card>
      </Section>

      <Section title={tr(lang, 'settings.device')}>
        <Card>
          <Row label={tr(lang, 'settings.device.ram')} value={`${Math.round(services.capabilities.totalRamMb / 1024)} GB`} />
          <Row label={tr(lang, 'settings.device.storage')} value={`${services.capabilities.freeStorageMb} MB`} />
          <Row
            label={tr(lang, 'settings.device.profile')}
            value={[services.profile.id, ...services.profile.reasons].join(' · ')}
          />
        </Card>
      </Section>

      <Section title={tr(lang, 'settings.package')}>
        <Card>
          <Row
            label={manifest ? manifest.id : tr(lang, 'settings.package.none')}
            value={manifest ? `${manifest.version} · ${manifest.createdAt.slice(0, 10)}` : '—'}
          />
          {manifest ? <Text variant="muted" className="pt-2">{tr(lang, 'library.package.stats', manifest.stats)}</Text> : null}
          {services.platform.installPackage ? (
            <View className="gap-2 pt-3">
              <Text variant="muted">{tr(lang, 'settings.package.install.help')}</Text>
              <Button variant="outline" label={tr(lang, 'settings.package.install')} onPress={() => void installPackage()} />
            </View>
          ) : null}
        </Card>
      </Section>

      <Section title={tr(lang, 'settings.data')}>
        <Card className="gap-3">
          <Text variant="muted">{tr(lang, 'settings.privacy')}</Text>
          <Button variant="outline" label={tr(lang, 'settings.rebuild')} onPress={() => void rebuildIndex()} />
          <Button variant="destructive" label={tr(lang, 'settings.clear_history')} onPress={() => void clearHistory()} />
          {feedback ? (
            <Text variant="small" accessibilityRole="alert" className={feedback.kind === 'error' ? 'text-danger' : 'text-primary'}>
              {feedback.text}
            </Text>
          ) : null}
        </Card>
      </Section>
    </ScrollView>
  );
}
