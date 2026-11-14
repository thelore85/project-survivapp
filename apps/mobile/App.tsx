import './global.css';

import { StatusBar } from 'expo-status-bar';
import { BookOpen, History, MessageSquare, Settings } from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SpeciesModal } from './src/components/SpeciesModal';
import { Badge, Text, cn } from './src/components/ui';
import { useIconColor } from './src/components/useIconColor';
import { ChatScreen } from './src/screens/ChatScreen';
import { ConversationList, HistoryScreen } from './src/screens/HistoryScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { useApp, type Screen } from './src/state/store';
import { tr, type StringKey } from './src/strings';

const WIDE_LAYOUT = 900;

const NAV: { screen: Screen; label: StringKey; icon: typeof MessageSquare; narrowOnly?: boolean }[] = [
  { screen: 'chat', label: 'nav.chat', icon: MessageSquare },
  { screen: 'history', label: 'nav.history', icon: History, narrowOnly: true },
  { screen: 'library', label: 'nav.library', icon: BookOpen },
  { screen: 'settings', label: 'nav.settings', icon: Settings },
];

function NavButton({ screen, label, icon: Icon, horizontal }: { screen: Screen; label: string; icon: typeof MessageSquare; horizontal: boolean }) {
  const current = useApp((state) => state.screen);
  const setScreen = useApp((state) => state.setScreen);
  const iconColor = useIconColor();
  const active = current === screen;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={() => setScreen(screen)}
      className={cn(
        'min-h-[48px] items-center justify-center gap-1 rounded-lg px-3 py-2',
        horizontal ? 'flex-row justify-start gap-3' : 'flex-1',
        active && 'bg-accent',
      )}
    >
      <Icon size={20} color={iconColor} />
      <Text variant="small" className={cn(horizontal ? 'text-sm' : 'text-xs', active && 'font-semibold')}>
        {label}
      </Text>
    </Pressable>
  );
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <View accessibilityRole="alert" className="border-b border-warning bg-warning-soft px-4 py-2">
      <Text variant="small" className="text-warning">
        {children}
      </Text>
    </View>
  );
}

function Shell() {
  const lang = useApp((state) => state.lang);
  const screen = useApp((state) => state.screen);
  const services = useApp((state) => state.services);
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_LAYOUT;
  const items = NAV.filter((item) => !(wide && item.narrowOnly));
  // Su schermi larghi la cronologia è già nella colonna laterale.
  const visibleScreen = wide && screen === 'history' ? 'chat' : screen;

  const body = (
    <View className="flex-1">
      {services?.platform.demo ? <Banner>{tr(lang, 'app.demo')}</Banner> : null}
      {services && !services.platform.manifest ? <Banner>{tr(lang, 'app.no_package')}</Banner> : null}
      {visibleScreen === 'chat' ? <ChatScreen /> : null}
      {visibleScreen === 'history' ? <HistoryScreen /> : null}
      {visibleScreen === 'library' ? <LibraryScreen /> : null}
      {visibleScreen === 'settings' ? <SettingsScreen /> : null}
    </View>
  );

  if (wide) {
    return (
      <View className="flex-1 flex-row bg-background">
        <View className="w-72 gap-4 border-r border-border bg-card p-4">
          <View className="gap-1">
            <Text variant="title">{tr(lang, 'app.title')}</Text>
            <Text variant="muted">{tr(lang, 'app.subtitle')}</Text>
          </View>
          <View accessibilityRole="tablist" className="gap-1">
            {items.map((item) => (
              <NavButton key={item.screen} screen={item.screen} label={tr(lang, item.label)} icon={item.icon} horizontal />
            ))}
          </View>
          <Text variant="label">{tr(lang, 'nav.history')}</Text>
          <View className="flex-1 overflow-hidden">
            <ConversationList />
          </View>
        </View>
        {body}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border bg-card px-4 py-3">
        <Text variant="heading">{tr(lang, 'app.title')}</Text>
        {services?.platform.demo ? <Badge tone="warning" label="demo" /> : null}
      </View>
      {body}
      <View accessibilityRole="tablist" className="flex-row gap-1 border-t border-border bg-card px-2 py-1">
        {items.map((item) => (
          <NavButton key={item.screen} screen={item.screen} label={tr(lang, item.label)} icon={item.icon} horizontal={false} />
        ))}
      </View>
    </View>
  );
}

export default function App() {
  const status = useApp((state) => state.status);
  const startupError = useApp((state) => state.startupError);
  const lang = useApp((state) => state.lang);
  const init = useApp((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-background">
        <StatusBar style="auto" />
        {status === 'loading' ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" />
            <Text variant="muted">{tr(lang, 'app.loading')}</Text>
          </View>
        ) : null}
        {status === 'error' ? (
          <View accessibilityRole="alert" className="flex-1 items-center justify-center gap-2 p-6">
            <Text variant="title">{tr(lang, 'app.error')}</Text>
            <Text variant="muted" selectable>
              {startupError}
            </Text>
          </View>
        ) : null}
        {status === 'ready' ? (
          <>
            <Shell />
            <SpeciesModal />
          </>
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
