import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useNotes } from '@/context/notes-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

function formatEchoStatus(noteFound: boolean, nextDueAt?: string): string {
  if (!noteFound) return 'Not found';
  if (!nextDueAt) return 'Echo enabled';
  const date = new Date(nextDueAt);
  if (Number.isNaN(date.getTime())) return 'Echo enabled';
  return `Next echo ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export default function NoteDetailScreen() {
  const { noteId } = useLocalSearchParams<{ noteId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const { recent, reviewed } = useNotes();
  const note = [...recent, ...reviewed].find((item) => item.id === noteId);

  return (
    <ThemedView style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            {
              borderColor: palette.border,
              backgroundColor: palette.surfaceAlt,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <ThemedText style={{ color: palette.text }}>Back</ThemedText>
        </Pressable>

        <View style={styles.header}>
          <ThemedText type="title">{note?.title ?? 'Note unavailable'}</ThemedText>
          <ThemedText style={{ color: palette.muted }}>
            {note?.bucket ?? 'Unbucketed'} · {formatEchoStatus(Boolean(note), note?.echo.nextDueAt)}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <ThemedText style={{ fontSize: 16, lineHeight: 24 }}>
            {note?.body ?? 'This note is no longer available on this device.'}
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 18,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  header: {
    gap: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
});

