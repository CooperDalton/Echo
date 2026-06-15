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
import type { BucketName } from '@/constants/buckets';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { BucketDraft, Note } from '@/lib/notes/types';

type BucketFilter = BucketName | 'All' | 'Unbucketed';

const PRESET_COLORS = {
  mint: { lightBg: '#E8F6EC', lightBorder: '#B8E1C4', lightText: '#1E6B3C', darkBg: '#223629', darkBorder: '#32543E', darkText: '#A9E3BC' },
  sky: { lightBg: '#EAF6FF', lightBorder: '#C7E7FF', lightText: '#1F5F8A', darkBg: '#1E3446', darkBorder: '#2D516A', darkText: '#A9D8FF' },
  purple: { lightBg: '#F1EAFE', lightBorder: '#D8C8FA', lightText: '#5E35A8', darkBg: '#2F2340', darkBorder: '#4A3770', darkText: '#D4C4F7' },
  orange: { lightBg: '#FFF4E6', lightBorder: '#F7D6B3', lightText: '#8A4B1F', darkBg: '#3A281B', darkBorder: '#5A3D2A', darkText: '#F2C9A1' },
  teal: { lightBg: '#E7F6F5', lightBorder: '#B7E2DF', lightText: '#1F5F5A', darkBg: '#1F3735', darkBorder: '#2E5551', darkText: '#A8E2DD' },
  pink: { lightBg: '#FFEAF3', lightBorder: '#F8C7DA', lightText: '#8A2757', darkBg: '#3C2432', darkBorder: '#5D364B', darkText: '#F3B8CF' },
  gold: { lightBg: '#FFF7E6', lightBorder: '#F3E0B5', lightText: '#7A5A1E', darkBg: '#3A301D', darkBorder: '#5A4A2D', darkText: '#EED59A' },
  indigo: { lightBg: '#EAEFFD', lightBorder: '#C6D0FA', lightText: '#2B3F8C', darkBg: '#202845', darkBorder: '#303D6E', darkText: '#B8C3F3' },
  red: { lightBg: '#FDEAEA', lightBorder: '#F7C4C4', lightText: '#8C2B2B', darkBg: '#402020', darkBorder: '#6B3030', darkText: '#F3B8B8' },
  slate: { lightBg: '#EEF1F5', lightBorder: '#D3DAE5', lightText: '#2E3A4A', darkBg: '#232A36', darkBorder: '#38475C', darkText: '#C5D0E3' },
  lime: { lightBg: '#F3FBE6', lightBorder: '#D8EDB0', lightText: '#48681A', darkBg: '#2A3521', darkBorder: '#3D5130', darkText: '#D3E8A6' },
  brown: { lightBg: '#F7EEE8', lightBorder: '#E3CDC0', lightText: '#6E3C26', darkBg: '#3A2920', darkBorder: '#5A3D30', darkText: '#E6CBB9' },
} as const;

type PresetKey = keyof typeof PRESET_COLORS;
const PRESET_COLOR_KEYS = Object.keys(PRESET_COLORS) as PresetKey[];

function normalizePresetKey(value: string): PresetKey {
  return PRESET_COLOR_KEYS.includes(value as PresetKey) ? (value as PresetKey) : PRESET_COLOR_KEYS[0];
}

function presetTone(colorKey: string, colorScheme: 'light' | 'dark') {
  const color = PRESET_COLORS[normalizePresetKey(colorKey)];
  return colorScheme === 'dark'
    ? { bg: color.darkBg, border: color.darkBorder, text: color.darkText }
    : { bg: color.lightBg, border: color.lightBorder, text: color.lightText };
}

function bucketTone(bucketName: BucketName, buckets: BucketDraft[], colorScheme: 'light' | 'dark') {
  const bucket = buckets.find((item) => item.name === bucketName);
  return bucket ? presetTone(bucket.colorKey, colorScheme) : uncategorizedTone(colorScheme);
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

function isLibraryNote(note: Note): boolean {
  return !(note.echo.enabled && note.bucket === null);
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
    bucketPreferences,
    markRecentAsReviewed,
    deleteRecentNote,
    deleteReviewedNote,
  } = useNotes();
  const customBuckets = bucketPreferences.customs;

  const [searchQuery, setSearchQuery] = useState('');
  const [bucketOpen, setBucketOpen] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<BucketFilter>('All');
  const [rowSizes, setRowSizes] = useState<Record<string, { width: number; height: number }>>({});

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const neutralTone = useMemo(() => uncategorizedTone(colorScheme), [colorScheme]);

  const selectedTone = useMemo(() => {
    if (selectedBucket === 'All') return null;
    if (selectedBucket === 'Unbucketed') return neutralTone;
    return bucketTone(selectedBucket, customBuckets, colorScheme);
  }, [selectedBucket, customBuckets, colorScheme, neutralTone]);

  const filteredRecent = useMemo(() => {
    const bucketFiltered = recent.filter(
      (note) => isLibraryNote(note) && noteMatchesBucket(note, selectedBucket)
    );
    if (!trimmedQuery) return bucketFiltered;

    return bucketFiltered.filter((note) =>
      `${note.title} ${note.body} ${note.bucket ?? 'unbucketed'}`
        .toLowerCase()
        .includes(trimmedQuery)
    );
  }, [recent, selectedBucket, trimmedQuery]);

  const filteredReviewed = useMemo(() => {
    const bucketFiltered = reviewed.filter(
      (note) => isLibraryNote(note) && noteMatchesBucket(note, selectedBucket)
    );
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
    const tone = note.bucket ? bucketTone(note.bucket, customBuckets, colorScheme) : neutralTone;

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

                  {customBuckets.map((bucket) => {
                    const tone = presetTone(bucket.colorKey, colorScheme);
                    return (
                      <Pressable
                        key={bucket.name}
                        style={({ pressed }) => [
                          styles.bucketOption,
                          {
                            backgroundColor: tone.bg,
                            borderColor: tone.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                        onPress={() => {
                          setSelectedBucket(bucket.name);
                          setBucketOpen(false);
                        }}
                      >
                        <ThemedText style={{ color: tone.text, fontSize: 13 }}>
                          {bucket.name}
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
                const reviewedTone = colorScheme === 'dark'
                  ? { bg: '#20352A', border: '#33583F', text: '#B9E8C7' }
                  : { bg: '#E8F6EC', border: '#B8E1C4', text: '#1E6B3C' };
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
