import { Plus, Trash2 } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Text, cn } from '../components/ui';
import { useIconColor } from '../components/useIconColor';
import { useApp } from '../state/store';
import { tr } from '../strings';

/** Elenco delle conversazioni salvate: usato come schermata su telefono e come colonna su schermi larghi. */
export function ConversationList({ className }: { className?: string }) {
  const lang = useApp((state) => state.lang);
  const conversations = useApp((state) => state.conversations);
  const activeId = useApp((state) => state.activeId);
  const openConversation = useApp((state) => state.openConversation);
  const deleteConversation = useApp((state) => state.deleteConversation);
  const newConversation = useApp((state) => state.newConversation);
  const iconColor = useIconColor();

  return (
    <View className={cn('gap-3', className)}>
      <Button variant="outline" label={tr(lang, 'chat.new')} icon={<Plus size={18} color={iconColor} />} onPress={newConversation} />
      {conversations.length === 0 ? <Text variant="muted">{tr(lang, 'history.empty')}</Text> : null}
      {conversations.map((conversation) => (
        <View
          key={conversation.id}
          className={cn('flex-row items-center rounded-lg', conversation.id === activeId ? 'bg-accent' : 'bg-transparent')}
        >
          <Pressable
            accessibilityRole="button"
            className="min-h-[44px] flex-1 justify-center px-3 py-2"
            onPress={() => void openConversation(conversation.id)}
          >
            <Text variant="small" numberOfLines={1} className="font-medium">
              {conversation.title}
            </Text>
            <Text variant="muted" className="text-xs">
              {new Date(conversation.updatedAt).toLocaleString(lang)}
            </Text>
          </Pressable>
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel={`${tr(lang, 'history.delete')}: ${conversation.title}`}
            icon={<Trash2 size={16} color={iconColor} />}
            onPress={() => void deleteConversation(conversation.id)}
          />
        </View>
      ))}
    </View>
  );
}

export function HistoryScreen() {
  return (
    <ScrollView className="flex-1" contentContainerClassName="mx-auto w-full max-w-3xl p-4">
      <ConversationList />
    </ScrollView>
  );
}
