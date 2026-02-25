import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BUCKET_COLORS, BUCKETS, type BucketName } from '@/constants/buckets';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const recentNotes: { title: string; body: string; bucket: BucketName }[] = [
  {
    title: 'Make “Echo” feel ambient',
    body: 'The app should surface ideas without feeling like reminders. Use calm language.',
    bucket: 'Systems',
  },
  {
    title: 'Widget text',
    body: 'If the note is long, keep a single sentence with exact meaning.',
    bucket: 'Reflections',
  },
  {
    title: 'Buckets are semantic',
    body: 'No status or task labels. Keep the list flat.',
    bucket: 'Business Ideas',
  },
];

function bucketTone(bucket: BucketName, colorScheme: 'light' | 'dark') {
  const color = BUCKET_COLORS[bucket];
  return colorScheme === 'dark'
    ? { bg: color.darkBg, border: color.darkBorder, text: color.darkText }
    : { bg: color.lightBg, border: color.lightBorder, text: color.lightText };
}

export default function LibraryScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const palette = Colors[colorScheme];
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [bucketOpen, setBucketOpen] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<BucketName | 'All'>('All');
  const trimmedQuery = searchQuery.trim().toLowerCase();

  const filteredNotes = useMemo(() => {
    const bucketFiltered =
      selectedBucket === 'All'
        ? recentNotes
        : recentNotes.filter((note) => note.bucket === selectedBucket);

    if (!trimmedQuery) {
      return bucketFiltered;
    }

    return bucketFiltered.filter((note) =>
      `${note.title} ${note.body} ${note.bucket}`.toLowerCase().includes(trimmedQuery)
    );
  }, [selectedBucket, trimmedQuery]);

  return (
    <ThemedView
      style={[styles.screen, { paddingTop: insets.top }]}
      onStartShouldSetResponder={() => bucketOpen}
      onResponderStart={() => {
        if (bucketOpen) setBucketOpen(false);
      }}
    >
      <ScrollView
        style={styles.scroll}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom, flexGrow: 1 }]}
      >
        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchInputWrap,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search notes"
              placeholderTextColor={palette.muted}
              style={[styles.searchInput, { color: palette.text }]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>

          <View style={styles.bucketWrap}>
            <Pressable
              style={({ pressed }) => [
                styles.bucketTrigger,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surfaceAlt,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              onPress={() => setBucketOpen((open) => !open)}>
              <ThemedText style={{ color: palette.text, fontSize: 13 }}>{selectedBucket}</ThemedText>
              <ThemedText style={{ color: palette.muted, fontSize: 12 }}>v</ThemedText>
            </Pressable>
            {bucketOpen ? (
              <View
                style={[
                  styles.bucketMenu,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}>
                <Pressable
                  style={({ pressed }) => [styles.bucketOption, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => {
                    setSelectedBucket('All');
                    setBucketOpen(false);
                  }}>
                  <ThemedText style={{ color: palette.text, fontSize: 13 }}>All</ThemedText>
                </Pressable>
                {BUCKETS.map((bucket) => (
                  <Pressable
                    key={bucket}
                    style={({ pressed }) => [styles.bucketOption, { opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => {
                      setSelectedBucket(bucket);
                      setBucketOpen(false);
                    }}>
                    <ThemedText style={{ color: palette.text, fontSize: 13 }}>{bucket}</ThemedText>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ fontSize: 18 }}>
            Recent Notes
          </ThemedText>
          <View style={styles.noteStack}>
            {filteredNotes.map((note) => {
              return (
                <Pressable
                  key={note.title}
                  accessibilityLabel={`Open note: ${note.title}`}
                  onPress={() =>
                    router.push({
                      pathname: '/note',
                      params: { title: note.title, body: note.body, bucket: note.bucket },
                    })
                  }
                  style={({ pressed }) => [
                    styles.noteCard,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <View style={styles.noteHeaderRow}>
                    <ThemedText style={styles.noteTitle} numberOfLines={1}>
                      {note.title}
                    </ThemedText>
                  </View>
                  <ThemedText style={{ color: palette.muted, marginTop: 6 }}>
                    {note.body}
                  </ThemedText>
                </Pressable>
              );
            })}
            {filteredNotes.length === 0 ? (
              <View
                style={[
                  styles.noteCard,
                  { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
                ]}>
                <ThemedText style={{ color: palette.muted }}>No notes match your search.</ThemedText>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    // Reduce vertical spacing between search row and section title
    gap: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInputWrap: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    // Center the TextInput vertically within the fixed height
    paddingVertical: 0,
    justifyContent: 'center',
    // Match dropdown height for visual consistency
    height: 40,
  },
  searchInput: {
    fontSize: 15,
    lineHeight: 18,
    textAlignVertical: 'center',
  },
  bucketWrap: {
    position: 'relative',
    // Ensure the menu sits above the click-away overlay
    zIndex: 30,
  },
  bucketTrigger: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    // Avoid extra internal vertical padding; rely on height + centering
    paddingVertical: 0,
    // Match search input height exactly
    height: 40,
    minWidth: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bucketMenu: {
    position: 'absolute',
    right: 0,
    top: 48,
    minWidth: 160,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    zIndex: 20,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  bucketOption: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  section: {
    gap: 12,
  },
  noteStack: {
    gap: 12,
  },
  noteCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  bucketPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  noteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noteTitle: {
    flex: 1,
    paddingRight: 10,
    fontSize: 15,
    lineHeight: 18,
    alignSelf: 'center',
  },
  noteBucketPill: {
    alignSelf: 'center',
  },
});
