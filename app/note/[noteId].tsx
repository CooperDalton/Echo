import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useNotes } from '@/context/notes-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

function formatEchoStatus(
  noteFound: boolean,
  enabled?: boolean,
  nextDueAt?: string
): string {
  if (!noteFound) return 'Not found';
  if (!enabled) return 'Echo complete';
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
  const { recent, reviewed, markNoteAsReviewed } = useNotes();
  const note = [...recent, ...reviewed].find((item) => item.id === noteId);
  const returnTo = note?.echo.enabled ? '/echo' : '/explore';

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
            {note?.bucket ?? 'Unbucketed'} ·{' '}
            {formatEchoStatus(Boolean(note), note?.echo.enabled, note?.echo.nextDueAt)}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <ThemedText style={{ fontSize: 16, lineHeight: 24 }}>
            {note?.body ?? 'This note is no longer available on this device.'}
          </ThemedText>
        </View>

        {note ? (
          <View style={styles.actions}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/',
                  params: {
                    text: note.body,
                    returnTo,
                    noteId: note.id,
                  },
                })
              }
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surfaceAlt,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <ThemedText style={{ color: palette.text, fontWeight: '600' }}>
                Edit
              </ThemedText>
            </Pressable>
            {note.echo.enabled ? (
              <Pressable
                onPress={() => {
                  markNoteAsReviewed(note.id);
                  router.replace('/echo');
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: palette.accent,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <ThemedText style={{ color: palette.background, fontWeight: '700' }}>
                  Reviewed
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
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
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
