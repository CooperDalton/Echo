import { useMemo, useState } from 'react';
import {
  Animated,
  Dimensions,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useNotes } from '@/context/notes-context';
import { BUCKET_COLORS, BUCKETS, type BucketName } from '@/constants/buckets';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Note } from '@/lib/notes/types';

type BucketFilter = BucketName | 'All' | 'Unbucketed';

function bucketTone(bucket: BucketName, colorScheme: 'light' | 'dark') {
  const color = BUCKET_COLORS[bucket];
  return colorScheme === 'dark'
    ? { bg: color.darkBg, border: color.darkBorder, text: color.darkText }
    : { bg: color.lightBg, border: color.lightBorder, text: color.lightText };
}

function uncategorizedTone(colorScheme: 'light' | 'dark') {
  return colorScheme === 'dark'
    ? { bg: '#2A2D33', border: '#3F4652', text: '#C9D0DC' }
    : { bg: '#F2F4F8', border: '#D6DCE6', text: '#4A5568' };
}

function dangerTone(colorScheme: 'light' | 'dark') {
  return colorScheme === 'dark'
    ? { bg: '#452323', border: '#6B3535', text: '#F2B8B5' }
    : { bg: '#FDEAEA', border: '#F2C6C6', text: '#8C2B2B' };
}

function noteMatchesBucket(note: Note, selectedBucket: BucketFilter): boolean {
  if (selectedBucket === 'All') return true;
  if (selectedBucket === 'Unbucketed') return note.bucket === null;
  return note.bucket === selectedBucket;
}

function noteBucketLabel(note: Note): string {
  if (note.bucket) return note.bucket;
  if (note.classificationStatus === 'pending') return 'Categorizing...';
  return 'Unbucketed';
}

function notePreview(body: string): string {
  return body.replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function shouldShowBodyOnly(note: Note): boolean {
  const body = notePreview(note.body);
  const title = notePreview(note.title);
  return body.length <= 32 || title.length === 0 || body === title;
}

export default function LibraryScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const palette = Colors[colorScheme];
  const router = useRouter();
  const {
    hydrated,
    recent,
    reviewed,
    markRecentAsReviewed,
    deleteRecentNote,
    deleteReviewedNote,
  } = useNotes();

  const [searchQuery, setSearchQuery] = useState('');
  const [bucketOpen, setBucketOpen] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<BucketFilter>('All');
  const [rowSizes, setRowSizes] = useState<Record<string, { width: number; height: number }>>({});

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const neutralTone = useMemo(() => uncategorizedTone(colorScheme), [colorScheme]);

  const selectedTone = useMemo(() => {
    if (selectedBucket === 'All') return null;
    if (selectedBucket === 'Unbucketed') return neutralTone;
    return bucketTone(selectedBucket, colorScheme);
  }, [selectedBucket, colorScheme, neutralTone]);

  const filteredRecent = useMemo(() => {
    const bucketFiltered = recent.filter((note) => noteMatchesBucket(note, selectedBucket));
    if (!trimmedQuery) return bucketFiltered;

    return bucketFiltered.filter((note) =>
      `${note.title} ${note.body} ${note.bucket ?? 'unbucketed'}`
        .toLowerCase()
        .includes(trimmedQuery)
    );
  }, [recent, selectedBucket, trimmedQuery]);

  const filteredReviewed = useMemo(() => {
    const bucketFiltered = reviewed.filter((note) => noteMatchesBucket(note, selectedBucket));
    if (!trimmedQuery) return bucketFiltered;

    return bucketFiltered.filter((note) =>
      `${note.title} ${note.body} ${note.bucket ?? 'unbucketed'}`
        .toLowerCase()
        .includes(trimmedQuery)
    );
  }, [reviewed, selectedBucket, trimmedQuery]);

  function onRowLayout(id: string) {
    return (e: LayoutChangeEvent) => {
      const { width: w, height: h } = e.nativeEvent.layout;
      setRowSizes((prev) => {
        const prevW = prev[id]?.width;
        const prevH = prev[id]?.height;
        if (prevW === w && prevH === h) return prev;
        return { ...prev, [id]: { width: w, height: h } };
      });
    };
  }

  function renderBucketPill(note: Note) {
    const tone = note.bucket ? bucketTone(note.bucket, colorScheme) : neutralTone;

    return (
      <View
        style={[
          styles.bucketPill,
          styles.noteBucketPill,
          { backgroundColor: tone.bg, borderColor: tone.border },
        ]}
      >
        <ThemedText style={{ fontSize: 10, lineHeight: 12, color: tone.text }}>
          {noteBucketLabel(note)}
        </ThemedText>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 28 + insets.bottom, flexGrow: 1 },
          ]}
        >
          <View style={styles.searchRow}>
            <View
              style={[
                styles.searchInputWrap,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            >
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
                    borderColor: selectedTone?.border ?? palette.border,
                    backgroundColor: selectedTone?.bg ?? palette.surfaceAlt,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                onPress={() => setBucketOpen((open) => !open)}
              >
                <ThemedText style={{ color: selectedTone?.text ?? palette.text, fontSize: 13 }}>
                  {selectedBucket}
                </ThemedText>
                <ThemedText
                  style={{ color: selectedTone?.text ?? palette.muted, fontSize: 12 }}
                >
                  v
                </ThemedText>
              </Pressable>
              {bucketOpen ? (
                <View
                  style={[
                    styles.bucketMenu,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                      paddingHorizontal: 6,
                    },
                  ]}
                >
                  <Pressable
                    style={({ pressed }) => [
                      styles.bucketOption,
                      {
                        backgroundColor: palette.surfaceAlt,
                        borderColor: palette.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                    onPress={() => {
                      setSelectedBucket('All');
                      setBucketOpen(false);
                    }}
                  >
                    <ThemedText style={{ color: palette.text, fontSize: 13 }}>All</ThemedText>
                  </Pressable>

                  {BUCKETS.map((bucket) => {
                    const tone = bucketTone(bucket, colorScheme);
                    return (
                      <Pressable
                        key={bucket}
                        style={({ pressed }) => [
                          styles.bucketOption,
                          {
                            backgroundColor: tone.bg,
                            borderColor: tone.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                        onPress={() => {
                          setSelectedBucket(bucket);
                          setBucketOpen(false);
                        }}
                      >
                        <ThemedText style={{ color: tone.text, fontSize: 13 }}>
                          {bucket}
                        </ThemedText>
                      </Pressable>
                    );
                  })}

                  <Pressable
                    style={({ pressed }) => [
                      styles.bucketOption,
                      {
                        backgroundColor: neutralTone.bg,
                        borderColor: neutralTone.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                    onPress={() => {
                      setSelectedBucket('Unbucketed');
                      setBucketOpen(false);
                    }}
                  >
                    <ThemedText style={{ color: neutralTone.text, fontSize: 13 }}>
                      Unbucketed
                    </ThemedText>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText type="subtitle" style={{ fontSize: 18 }}>
              Recent Notes
            </ThemedText>
            <View style={styles.noteStack}>
              {filteredRecent.map((note) => {
                const reviewedTone = bucketTone('Business Ideas', colorScheme);
                const size = rowSizes[note.id];
                const actionWidth = size?.width ?? Dimensions.get('window').width;
                const actionHeight = size?.height;
                const bodyOnly = shouldShowBodyOnly(note);
                const bodyText = notePreview(note.body);
                const titleText = bodyOnly ? bodyText : note.title;

                return (
                  <Swipeable
                    key={note.id}
                    friction={1.1}
                    rightThreshold={Math.min(120, Math.max(60, actionWidth * 0.25))}
                    leftThreshold={Math.min(120, Math.max(60, actionWidth * 0.25))}
                    overshootRight={false}
                    overshootLeft={false}
                    containerStyle={{ overflow: 'visible' }}
                    childrenContainerStyle={{ overflow: 'visible' }}
                    renderRightActions={(_progress, dragX) => {
                      if (!size) return null;
                      const translateIn = dragX.interpolate({
                        inputRange: [-actionWidth, 0],
                        outputRange: [0, actionWidth],
                        extrapolate: 'clamp',
                      });

                      return (
                        <View
                          style={[
                            styles.rightActionContainer,
                            {
                              width: actionWidth,
                              height: actionHeight,
                              borderRadius: 18,
                            },
                          ]}
                        >
                          <Animated.View
                            style={[
                              styles.rightActionFill,
                              {
                                width: actionWidth,
                                transform: [{ translateX: translateIn }],
                                backgroundColor: reviewedTone.bg,
                                borderColor: reviewedTone.border,
                              },
                            ]}
                          >
                            <ThemedText style={{ color: reviewedTone.text, fontSize: 13 }}>
                              Reviewed
                            </ThemedText>
                          </Animated.View>
                        </View>
                      );
                    }}
                    renderLeftActions={(_progress, dragX) => {
                      if (!size) return null;
                      const danger = dangerTone(colorScheme);
                      const translateIn = dragX.interpolate({
                        inputRange: [0, actionWidth],
                        outputRange: [-actionWidth, 0],
                        extrapolate: 'clamp',
                      });

                      return (
                        <View
                          style={[
                            styles.leftActionContainer,
                            { width: actionWidth, height: actionHeight, borderRadius: 18 },
                          ]}
                        >
                          <Animated.View
                            style={[
                              styles.leftActionFill,
                              {
                                width: actionWidth,
                                transform: [{ translateX: translateIn }],
                                backgroundColor: danger.bg,
                                borderColor: danger.border,
                              },
                            ]}
                          >
                            <ThemedText style={{ color: danger.text, fontSize: 13 }}>
                              Delete
                            </ThemedText>
                          </Animated.View>
                        </View>
                      );
                    }}
                    onSwipeableOpen={(dir) => {
                      if (dir === 'right') {
                        markRecentAsReviewed(note.id);
                      } else if (dir === 'left') {
                        deleteRecentNote(note.id);
                      }
                    }}
                  >
                    <Pressable
                      onLayout={onRowLayout(note.id)}
                      accessibilityLabel={`Open note: ${note.title}`}
                      onPress={() => {
                        router.push({
                          pathname: '/',
                          params: { text: note.body, returnTo: '/explore', noteId: note.id },
                        });
                      }}
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
                          {titleText}
                        </ThemedText>
                        {renderBucketPill(note)}
                      </View>
                      {bodyOnly ? null : (
                        <ThemedText
                          style={{ color: palette.muted, marginTop: 6 }}
                          numberOfLines={2}
                        >
                          {bodyText}
                        </ThemedText>
                      )}
                    </Pressable>
                  </Swipeable>
                );
              })}

              {filteredRecent.length === 0 ? (
                <View
                  style={[
                    styles.noteCard,
                    { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
                  ]}
                >
                  <ThemedText style={{ color: palette.muted }}>
                    {hydrated
                      ? 'No recent notes match your search.'
                      : 'Loading local notes...'}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText type="subtitle" style={{ fontSize: 18 }}>
              Notes
            </ThemedText>
            <View style={styles.noteStack}>
              {filteredReviewed.map((note) => {
                const size = rowSizes[note.id];
                const actionWidth = size?.width ?? Dimensions.get('window').width;
                const actionHeight = size?.height;
                const bodyOnly = shouldShowBodyOnly(note);
                const bodyText = notePreview(note.body);
                const titleText = bodyOnly ? bodyText : note.title;

                return (
                  <Swipeable
                    key={note.id}
                    friction={1.1}
                    rightThreshold={Math.min(120, Math.max(60, actionWidth * 0.25))}
                    leftThreshold={Math.min(120, Math.max(60, actionWidth * 0.25))}
                    overshootRight={false}
                    overshootLeft={false}
                    containerStyle={{ overflow: 'visible' }}
                    childrenContainerStyle={{ overflow: 'visible' }}
                    renderLeftActions={(_progress, dragX) => {
                      if (!size) return null;
                      const danger = dangerTone(colorScheme);
                      const translateIn = dragX.interpolate({
                        inputRange: [0, actionWidth],
                        outputRange: [-actionWidth, 0],
                        extrapolate: 'clamp',
                      });

                      return (
                        <View
                          style={[
                            styles.leftActionContainer,
                            { width: actionWidth, height: actionHeight, borderRadius: 18 },
                          ]}
                        >
                          <Animated.View
                            style={[
                              styles.leftActionFill,
                              {
                                width: actionWidth,
                                transform: [{ translateX: translateIn }],
                                backgroundColor: danger.bg,
                                borderColor: danger.border,
                              },
                            ]}
                          >
                            <ThemedText style={{ color: danger.text, fontSize: 13 }}>
                              Delete
                            </ThemedText>
                          </Animated.View>
                        </View>
                      );
                    }}
                    onSwipeableOpen={(dir) => {
                      if (dir === 'left') {
                        deleteReviewedNote(note.id);
                      }
                    }}
                  >
                    <Pressable
                      onLayout={onRowLayout(note.id)}
                      accessibilityLabel={`Open note: ${note.title}`}
                      onPress={() => {
                        router.push({
                          pathname: '/',
                          params: { text: note.body, returnTo: '/explore', noteId: note.id },
                        });
                      }}
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
                          {titleText}
                        </ThemedText>
                        {renderBucketPill(note)}
                      </View>
                      {bodyOnly ? null : (
                        <ThemedText
                          style={{ color: palette.muted, marginTop: 6 }}
                          numberOfLines={2}
                        >
                          {bodyText}
                        </ThemedText>
                      )}
                    </Pressable>
                  </Swipeable>
                );
              })}

              {filteredReviewed.length === 0 ? (
                <View
                  style={[
                    styles.noteCard,
                    { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
                  ]}
                >
                  <ThemedText style={{ color: palette.muted }}>
                    {hydrated
                      ? 'No reviewed notes match your search.'
                      : 'Loading local notes...'}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </ThemedView>
    </GestureHandlerRootView>
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
    gap: 16,
    overflow: 'visible',
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
    paddingVertical: 0,
    justifyContent: 'center',
    height: 40,
  },
  searchInput: {
    fontSize: 15,
    lineHeight: 18,
    textAlignVertical: 'center',
  },
  bucketWrap: {
    position: 'relative',
    zIndex: 30,
  },
  bucketTrigger: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 0,
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
    borderWidth: 1,
    borderRadius: 10,
    marginVertical: 4,
  },
  section: {
    gap: 12,
    overflow: 'visible',
  },
  noteStack: {
    gap: 12,
    overflow: 'visible',
  },
  noteCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  rightActionContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    overflow: 'hidden',
    borderRadius: 18,
  },
  rightActionFill: {
    height: '100%',
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  leftActionContainer: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    overflow: 'hidden',
    borderRadius: 18,
  },
  leftActionFill: {
    height: '100%',
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
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
