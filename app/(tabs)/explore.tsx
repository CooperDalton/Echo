import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BUCKET_COLORS, type BucketName } from '@/constants/buckets';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const searchAnim = useRef(new Animated.Value(0)).current;

  const filteredNotes = useMemo(() => {
    if (!trimmedQuery) {
      return recentNotes;
    }

    return recentNotes.filter((note) =>
      `${note.title} ${note.body} ${note.bucket}`.toLowerCase().includes(trimmedQuery)
    );
  }, [trimmedQuery]);

  useEffect(() => {
    Animated.timing(searchAnim, {
      toValue: showSearch ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [searchAnim, showSearch]);

  const searchTranslateY = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });

  return (
    <ThemedView style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}
        scrollEventThrottle={16}
        onScroll={(event) => {
          const offsetY = event.nativeEvent.contentOffset.y;
          if (offsetY < -20 && !showSearch) {
            setShowSearch(true);
          } else if (offsetY >= 0 && !searchQuery && showSearch) {
            setShowSearch(false);
          }
        }}>
        <View style={styles.searchSlot}>
          <Animated.View
            pointerEvents={showSearch ? 'auto' : 'none'}
            style={[
              styles.searchInputWrap,
              { backgroundColor: palette.surface, borderColor: palette.border },
              { opacity: searchAnim, transform: [{ translateY: searchTranslateY }] },
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
          </Animated.View>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ fontSize: 18 }}>
            Recent Notes
          </ThemedText>
          <View style={styles.noteStack}>
            {filteredNotes.map((note) => {
              const tone = bucketTone(note.bucket, colorScheme);
              return (
                <View
                  key={note.title}
                  style={[
                    styles.noteCard,
                    { backgroundColor: palette.surface, borderColor: palette.border },
                  ]}>
                  <View style={styles.noteHeaderRow}>
                    <ThemedText style={styles.noteTitle} numberOfLines={1}>
                      {note.title}
                    </ThemedText>
                    <View
                      style={[
                        styles.bucketPill,
                        styles.noteBucketPill,
                        { backgroundColor: tone.bg, borderColor: tone.border },
                      ]}>
                      <ThemedText style={{ fontSize: 10, lineHeight: 12, color: tone.text }}>
                        {note.bucket}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={{ color: palette.muted, marginTop: 6 }}>
                    {note.body}
                  </ThemedText>
                </View>
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
  content: {
    paddingHorizontal: 20,
    gap: 24,
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
  searchSlot: {
    height: 46,
    justifyContent: 'center',
  },
  searchInputWrap: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    fontSize: 15,
    lineHeight: 18,
  },
});
