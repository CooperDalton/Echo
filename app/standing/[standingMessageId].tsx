import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useNotes } from '@/context/notes-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function StandingMessageScreen() {
  const { standingMessageId } = useLocalSearchParams<{ standingMessageId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const { standingMessages, upsertStandingMessage, deleteStandingMessage } = useNotes();
  const message = standingMessages.find((item) => item.id === standingMessageId);
  const isNew = standingMessageId === 'new';
  const [text, setText] = useState(message?.text ?? '');

  useEffect(() => {
    setText(message?.text ?? '');
  }, [message?.text]);

  const canSave = useMemo(() => text.trim().length > 0, [text]);

  return (
    <ThemedView style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.replace('/echo')}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: palette.border, backgroundColor: palette.surfaceAlt, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <ThemedText style={{ color: palette.text }}>Cancel</ThemedText>
          </Pressable>
          <View style={styles.actions}>
            {!isNew && message ? (
              <Pressable
                onPress={() => {
                  deleteStandingMessage(message.id);
                  router.replace('/echo');
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: '#C44E4E', backgroundColor: palette.surfaceAlt, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <ThemedText style={{ color: '#C44E4E' }}>Delete</ThemedText>
              </Pressable>
            ) : null}
            <Pressable
              disabled={!canSave}
              onPress={() => {
                upsertStandingMessage(isNew ? null : message?.id ?? null, text);
                router.replace('/echo');
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: palette.accent, opacity: pressed || !canSave ? 0.7 : 1 },
              ]}
            >
              <ThemedText style={{ color: palette.background }}>Save</ThemedText>
            </Pressable>
          </View>
        </View>

        <TextInput
          autoFocus
          multiline
          placeholder="Standing reminder"
          placeholderTextColor={palette.muted}
          value={text}
          onChangeText={setText}
          style={[styles.input, { color: palette.text, fontFamily: Fonts.sans }]}
          textAlignVertical="top"
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    borderRadius: 999,
    height: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    fontSize: 16,
    lineHeight: 22,
  },
});

