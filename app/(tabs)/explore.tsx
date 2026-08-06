import { useMemo, useState } from 'react';
import {
  Animated,
  Dimensions,
  type LayoutChangeEvent,
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
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useNotes } from '@/context/notes-context';
import type { BucketName } from '@/constants/buckets';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { BucketDraft, Note, WeeklyReview } from '@/lib/notes/types';

type BucketFilter = BucketName | 'All' | 'Unbucketed' | 'Weekly Reviews';
type LibraryItem =
  | { kind: 'note'; note: Note; list: 'recent' | 'reviewed'; sortDate: string }
  | { kind: 'weekly-review'; review: WeeklyReview; sortDate: string };

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
  return PRESET_COLOR_KEYS.includes(value as PresetKey) ? (value as PresetKey) : 'mint';
}

function presetTone(colorKey: string, colorScheme: 'light' | 'dark') {
  const color = PRESET_COLORS[normalizePresetKey(colorKey)];
  return colorScheme === 'dark'
    ? { bg: color.darkBg, border: color.darkBorder, text: color.darkText }
    : { bg: color.lightBg, border: color.lightBorder, text: color.lightText };
}

function uncategorizedTone(colorScheme: 'light' | 'dark') {
  return colorScheme === 'dark'
    ? { bg: '#2A2D33', border: '#3F4652', text: '#C9D0DC' }
    : { bg: '#F2F4F8', border: '#D6DCE6', text: '#4A5568' };
}

function weeklyReviewTone(colorScheme: 'light' | 'dark') {
  return colorScheme === 'dark'
    ? { bg: '#332947', border: '#51416F', text: '#D8C7F4' }
    : { bg: '#F1EAFE', border: '#D8C8FA', text: '#5E35A8' };
}

function dangerTone(colorScheme: 'light' | 'dark') {
  return colorScheme === 'dark'
    ? { bg: '#452323', border: '#6B3535', text: '#F2B8B5' }
    : { bg: '#FDEAEA', border: '#F2C6C6', text: '#8C2B2B' };
}

function bucketTone(bucketName: BucketName, buckets: BucketDraft[], colorScheme: 'light' | 'dark') {
  const bucket = buckets.find((item) => item.name === bucketName);
  return bucket ? presetTone(bucket.colorKey, colorScheme) : uncategorizedTone(colorScheme);
}

function isLibraryNote(note: Note): boolean {
  return !(note.echo.enabled && note.bucket === null);
}

function noteMatchesFilter(note: Note, selected: BucketFilter): boolean {
  if (selected === 'All') return true;
  if (selected === 'Weekly Reviews') return false;
  if (selected === 'Unbucketed') return note.bucket === null;
  return note.bucket === selected;
}

function notePreview(body: string): string {
  return body.replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function shouldShowBodyOnly(note: Note): boolean {
  const body = notePreview(note.body);
  const title = notePreview(note.title);
  return body.length <= 32 || !title || body === title;
}

function formatWeeklyReviewDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Weekly review';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function weeklyReviewSearchText(review: WeeklyReview): string {
  return `${formatWeeklyReviewDate(review.scheduledFor)} ${review.reflection} ${review.nextWeekIntent}`.toLowerCase();
}

export default function LibraryScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    hydrated,
    recent,
    reviewed,
    weeklyReviews,
    bucketPreferences,
    markNoteAsReviewed,
    deleteRecentNote,
    deleteReviewedNote,
  } = useNotes();
  const customBuckets = bucketPreferences.customs;
  const [searchQuery, setSearchQuery] = useState('');
  const [bucketOpen, setBucketOpen] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<BucketFilter>('All');
  const [rowSizes, setRowSizes] = useState<Record<string, { width: number; height: number }>>({});
  const trimmedQuery = searchQuery.trim().toLowerCase();

  const filterOptions: BucketFilter[] = useMemo(
    () => ['All', 'Weekly Reviews', 'Unbucketed', ...customBuckets.map((bucket) => bucket.name)],
    [customBuckets]
  );

  const selectedTone = useMemo(() => {
    if (selectedBucket === 'All') return null;
    if (selectedBucket === 'Weekly Reviews') return weeklyReviewTone(colorScheme);
    if (selectedBucket === 'Unbucketed') return uncategorizedTone(colorScheme);
    return bucketTone(selectedBucket, customBuckets, colorScheme);
  }, [colorScheme, customBuckets, selectedBucket]);

  const libraryItems = useMemo(() => {
    const noteItems: LibraryItem[] = [
      ...recent.map((note) => ({ kind: 'note' as const, note, list: 'recent' as const, sortDate: note.createdAt })),
      ...reviewed.map((note) => ({ kind: 'note' as const, note, list: 'reviewed' as const, sortDate: note.createdAt })),
    ].filter((item) => {
      if (!isLibraryNote(item.note) || !noteMatchesFilter(item.note, selectedBucket)) return false;
      if (!trimmedQuery) return true;
      return `${item.note.title} ${item.note.body} ${item.note.bucket ?? 'unbucketed'}`
        .toLowerCase()
        .includes(trimmedQuery);
    });

    const reviewItems: LibraryItem[] =
      selectedBucket === 'All' || selectedBucket === 'Weekly Reviews'
        ? weeklyReviews
            .filter((review) => !trimmedQuery || weeklyReviewSearchText(review).includes(trimmedQuery))
            .map((review) => ({
              kind: 'weekly-review' as const,
              review,
              sortDate: review.scheduledFor,
            }))
        : [];

    return [...noteItems, ...reviewItems].sort((left, right) =>
      right.sortDate.localeCompare(left.sortDate)
    );
  }, [recent, reviewed, selectedBucket, trimmedQuery, weeklyReviews]);

  function onRowLayout(id: string) {
    return (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setRowSizes((current) =>
        current[id]?.width === width && current[id]?.height === height
          ? current
          : { ...current, [id]: { width, height } }
      );
    };
  }

  function renderNote(item: Extract<LibraryItem, { kind: 'note' }>) {
    const { note, list } = item;
    const size = rowSizes[note.id];
    const actionWidth = size?.width ?? Dimensions.get('window').width;
    const bodyOnly = shouldShowBodyOnly(note);
    const bodyText = notePreview(note.body);
    const titleText = bodyOnly ? bodyText : note.title;
    const noteTone = note.bucket
      ? bucketTone(note.bucket, customBuckets, colorScheme)
      : uncategorizedTone(colorScheme);
    const reviewedTone = colorScheme === 'dark'
      ? { bg: '#20352A', border: '#33583F', text: '#B9E8C7' }
      : { bg: '#E8F6EC', border: '#B8E1C4', text: '#1E6B3C' };

    return (
      <Swipeable
        key={`note-${note.id}`}
        friction={1.1}
        leftThreshold={Math.min(120, Math.max(60, actionWidth * 0.25))}
        rightThreshold={Math.min(120, Math.max(60, actionWidth * 0.25))}
        overshootLeft={false}
        overshootRight={false}
        renderLeftActions={(_progress, dragX) => {
          if (!size) return null;
          const danger = dangerTone(colorScheme);
          const translateIn = dragX.interpolate({
            inputRange: [0, actionWidth],
            outputRange: [-actionWidth, 0],
            extrapolate: 'clamp',
          });
          return (
            <View style={[styles.swipeActionContainer, { width: actionWidth, height: size.height }]}>
              <Animated.View
                style={[
                  styles.swipeActionFill,
                  {
                    width: actionWidth,
                    backgroundColor: danger.bg,
                    borderColor: danger.border,
                    transform: [{ translateX: translateIn }],
                  },
                ]}
              >
                <ThemedText style={{ color: danger.text, fontSize: 13 }}>Delete</ThemedText>
              </Animated.View>
            </View>
          );
        }}
        renderRightActions={list === 'recent' ? (_progress, dragX) => {
          if (!size) return null;
          const translateIn = dragX.interpolate({
            inputRange: [-actionWidth, 0],
            outputRange: [0, actionWidth],
            extrapolate: 'clamp',
          });
          return (
            <View style={[styles.swipeActionContainer, { width: actionWidth, height: size.height }]}>
              <Animated.View
                style={[
                  styles.swipeActionFill,
                  {
                    width: actionWidth,
                    backgroundColor: reviewedTone.bg,
                    borderColor: reviewedTone.border,
                    transform: [{ translateX: translateIn }],
                  },
                ]}
              >
                <ThemedText style={{ color: reviewedTone.text, fontSize: 13 }}>Reviewed</ThemedText>
              </Animated.View>
            </View>
          );
        } : undefined}
        onSwipeableOpen={(direction) => {
          if (direction === 'right' && list === 'recent') markNoteAsReviewed(note.id);
          if (direction === 'left') {
            if (list === 'recent') deleteRecentNote(note.id);
            else deleteReviewedNote(note.id);
          }
        }}
      >
        <Pressable
          onLayout={onRowLayout(note.id)}
          accessibilityLabel={`Open note: ${note.title}`}
          onPress={() => router.push({ pathname: '/', params: { text: note.body, returnTo: '/explore', noteId: note.id } })}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <View style={styles.cardHeader}>
            <ThemedText style={styles.cardTitle} numberOfLines={1}>{titleText}</ThemedText>
            <View style={[styles.pill, { backgroundColor: noteTone.bg, borderColor: noteTone.border }]}>
              <ThemedText style={{ color: noteTone.text, fontSize: 11 }} numberOfLines={1}>
                {note.bucket ?? (note.classificationStatus === 'pending' ? 'Categorizing…' : 'Unbucketed')}
              </ThemedText>
            </View>
          </View>
          {!bodyOnly ? (
            <ThemedText style={{ color: palette.muted, marginTop: 6 }} numberOfLines={2}>
              {bodyText}
            </ThemedText>
          ) : null}
        </Pressable>
      </Swipeable>
    );
  }

  function renderWeeklyReview(review: WeeklyReview) {
    const tone = weeklyReviewTone(colorScheme);
    return (
      <Pressable
        key={`weekly-${review.id}`}
        accessibilityLabel={`Open weekly review from ${formatWeeklyReviewDate(review.scheduledFor)}`}
        onPress={() => router.push({ pathname: '/weekly-review', params: { reviewId: review.id, source: 'history' } })}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: palette.surface, borderColor: tone.border, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.weeklyTitleWrap}>
            <IconSymbol name="calendar" size={17} color={tone.text} />
            <ThemedText style={styles.cardTitle}>{formatWeeklyReviewDate(review.scheduledFor)}</ThemedText>
          </View>
          <View style={[styles.pill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
            <ThemedText style={{ color: tone.text, fontSize: 11 }}>Weekly Review</ThemedText>
          </View>
        </View>
        <View style={styles.reviewPreview}>
          <ThemedText style={styles.previewLabel}>The week</ThemedText>
          <ThemedText style={{ color: palette.text }} numberOfLines={2}>{review.reflection}</ThemedText>
          <ThemedText style={styles.previewLabel}>Next week</ThemedText>
          <ThemedText style={{ color: palette.text }} numberOfLines={2}>{review.nextWeekIntent}</ThemedText>
        </View>
      </Pressable>
    );
  }

  return (
    <GestureHandlerRootView style={styles.screen}>
      <ThemedView style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}
        >
          <View style={styles.searchRow}>
            <View style={[styles.searchInputWrap, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <TextInput
                accessibilityLabel="Search library"
                placeholder="Search"
                placeholderTextColor={palette.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={[styles.searchInput, { color: palette.text }]}
              />
            </View>
            <View style={styles.filterWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Filter library"
                onPress={() => setBucketOpen((open) => !open)}
                style={[
                  styles.filterTrigger,
                  {
                    backgroundColor: selectedTone?.bg ?? palette.surface,
                    borderColor: selectedTone?.border ?? palette.border,
                  },
                ]}
              >
                <ThemedText style={{ color: selectedTone?.text ?? palette.text, fontSize: 13 }} numberOfLines={1}>
                  {selectedBucket}
                </ThemedText>
                <IconSymbol name={bucketOpen ? 'chevron.up' : 'chevron.down'} size={14} color={selectedTone?.text ?? palette.text} />
              </Pressable>
              {bucketOpen ? (
                <View style={[styles.filterMenu, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                  {filterOptions.map((option) => {
                    const tone = option === 'Weekly Reviews'
                      ? weeklyReviewTone(colorScheme)
                      : option === 'Unbucketed'
                        ? uncategorizedTone(colorScheme)
                        : option === 'All'
                          ? null
                          : bucketTone(option, customBuckets, colorScheme);
                    return (
                      <Pressable
                        key={option}
                        onPress={() => { setSelectedBucket(option); setBucketOpen(false); }}
                        style={[
                          styles.filterOption,
                          { backgroundColor: tone?.bg ?? palette.surfaceAlt, borderColor: tone?.border ?? palette.border },
                        ]}
                      >
                        <ThemedText style={{ color: tone?.text ?? palette.text, fontSize: 13 }}>{option}</ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={{ fontSize: 18 }}>
              {selectedBucket === 'Weekly Reviews' ? 'Weekly Reviews' : 'Library'}
            </ThemedText>
            <ThemedText style={{ color: palette.muted, fontSize: 12 }}>
              {libraryItems.length} {libraryItems.length === 1 ? 'item' : 'items'}
            </ThemedText>
          </View>

          <View style={styles.cardStack}>
            {libraryItems.map((item) =>
              item.kind === 'weekly-review' ? renderWeeklyReview(item.review) : renderNote(item)
            )}
            {libraryItems.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
                <ThemedText style={{ color: palette.muted, textAlign: 'center' }}>
                  {hydrated ? 'Nothing matches this search.' : 'Loading your library…'}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </ThemedView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, gap: 16, overflow: 'visible' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 20 },
  searchInputWrap: { flex: 1, height: 42, borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center' },
  searchInput: { fontSize: 15, lineHeight: 18 },
  filterWrap: { position: 'relative', zIndex: 30 },
  filterTrigger: { height: 42, minWidth: 112, maxWidth: 150, borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  filterMenu: { position: 'absolute', right: 0, top: 48, minWidth: 180, borderWidth: 1, borderRadius: 14, padding: 7, zIndex: 40, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  filterOption: { minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, justifyContent: 'center', marginVertical: 3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardStack: { gap: 12, overflow: 'visible' },
  card: { borderRadius: 18, borderWidth: 1, padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 15, lineHeight: 19, fontWeight: '600' },
  weeklyTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { maxWidth: 132, alignSelf: 'center', borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  reviewPreview: { gap: 4, marginTop: 12 },
  previewLabel: { marginTop: 4, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', opacity: 0.6 },
  swipeActionContainer: { justifyContent: 'center', overflow: 'hidden', borderRadius: 18 },
  swipeActionFill: { height: '100%', borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 22 },
});
