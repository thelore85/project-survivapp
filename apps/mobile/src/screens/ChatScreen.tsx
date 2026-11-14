import type { StoredMessage } from '@survivapp/core';
import { Camera, ImageIcon, SendHorizontal, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, TextInput, View } from 'react-native';
import { AnswerPartView } from '../components/Answer';
import { Button, Card, Text } from '../components/ui';
import { useIconColor } from '../components/useIconColor';
import { useApp } from '../state/store';
import { tr } from '../strings';

function MessageView({ message, onOption }: { message: StoredMessage; onOption: (label: string) => void }) {
  const lang = useApp((state) => state.lang);
  if (message.role === 'user') {
    return (
      <View className="max-w-[85%] gap-2 self-end rounded-2xl rounded-br-sm bg-primary px-4 py-3">
        {message.imageRef ? (
          <Image source={{ uri: message.imageRef }} accessibilityLabel={tr(lang, 'chat.photo')} className="h-40 w-40 rounded-xl" />
        ) : null}
        {message.text ? <Text className="text-primary-foreground">{message.text}</Text> : null}
      </View>
    );
  }
  return (
    <Card className="gap-5 self-stretch">
      {message.reply.parts.map((part, index) => (
        <AnswerPartView key={index} part={part} lang={lang} onOption={onOption} />
      ))}
      {message.reply.timings ? (
        <Text variant="muted" className="text-xs">
          {tr(lang, 'chat.elapsed', { seconds: (message.reply.timings.totalMs / 1000).toFixed(1) })}
        </Text>
      ) : null}
    </Card>
  );
}

/** Chat principale: testo, foto da fotocamera o galleria, risposte con fonti e schede. */
export function ChatScreen() {
  const lang = useApp((state) => state.lang);
  const messages = useApp((state) => state.messages);
  const busy = useApp((state) => state.busy);
  const progress = useApp((state) => state.progress);
  const chatError = useApp((state) => state.chatError);
  const pendingImage = useApp((state) => state.pendingImage);
  const send = useApp((state) => state.send);
  const attachImage = useApp((state) => state.attachImage);
  const clearImage = useApp((state) => state.clearImage);
  const iconColor = useIconColor();
  const [draft, setDraft] = useState('');
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [messages.length, busy]);

  const submit = (text: string): void => {
    setDraft('');
    void send(text);
  };

  return (
    <View className="flex-1">
      <ScrollView ref={scroll} className="flex-1" contentContainerClassName="mx-auto w-full max-w-3xl gap-4 p-4">
        {messages.length === 0 && !busy ? (
          <View className="gap-4 py-10">
            <Text variant="title">{tr(lang, 'chat.empty.title')}</Text>
            <Text variant="muted">{tr(lang, 'chat.empty.body')}</Text>
            <View className="gap-2">
              {(['chat.example.1', 'chat.example.2', 'chat.example.3'] as const).map((key) => (
                <Button key={key} variant="outline" label={tr(lang, key)} className="justify-start" onPress={() => submit(tr(lang, key))} />
              ))}
            </View>
          </View>
        ) : null}
        {messages.map((message) => (
          <MessageView key={`${message.id}-${message.createdAt}`} message={message} onOption={submit} />
        ))}
        {busy ? (
          <View accessibilityRole="progressbar" className="flex-row items-center gap-3 self-start rounded-2xl bg-muted px-4 py-3">
            <ActivityIndicator size="small" />
            <Text variant="muted">{progress ?? tr(lang, 'chat.working')}</Text>
          </View>
        ) : null}
        {chatError ? (
          <View accessibilityRole="alert" className="rounded-lg border border-danger bg-danger-soft px-3 py-2">
            <Text variant="small" className="text-danger">
              {tr(lang, 'chat.error', { message: chatError })}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View className="border-t border-border bg-card">
        <View className="mx-auto w-full max-w-3xl gap-2 p-3">
          {pendingImage ? (
            <View className="flex-row items-center gap-3">
              <Image source={{ uri: pendingImage.uri }} accessibilityLabel={tr(lang, 'chat.photo')} className="h-16 w-16 rounded-lg bg-muted" />
              <Button
                variant="ghost"
                size="sm"
                label={tr(lang, 'chat.remove_photo')}
                icon={<X size={16} color={iconColor} />}
                onPress={clearImage}
              />
            </View>
          ) : null}
          <View className="flex-row items-end gap-2">
            <Button
              variant="outline"
              size="icon"
              accessibilityLabel={tr(lang, 'chat.camera')}
              icon={<Camera size={20} color={iconColor} />}
              disabled={busy}
              onPress={() => void attachImage('camera')}
            />
            <Button
              variant="outline"
              size="icon"
              accessibilityLabel={tr(lang, 'chat.gallery')}
              icon={<ImageIcon size={20} color={iconColor} />}
              disabled={busy}
              onPress={() => void attachImage('library')}
            />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={tr(lang, 'chat.placeholder')}
              placeholderTextColor="#8a8f8a"
              accessibilityLabel={tr(lang, 'chat.placeholder')}
              multiline
              editable={!busy}
              onSubmitEditing={() => submit(draft)}
              submitBehavior="submit"
              className="max-h-32 min-h-[44px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground"
            />
            <Button
              size="icon"
              accessibilityLabel={tr(lang, 'chat.send')}
              icon={<SendHorizontal size={20} color="#ffffff" />}
              disabled={busy || (!draft.trim() && !pendingImage)}
              onPress={() => submit(draft)}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
