import {
  Alert,
  Animated,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  Modal,
  TextInput,
} from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useNotes } from '@/context/notes-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Note, WidgetEntry } from '@/lib/notes/types';
import { createWidgetEntries } from '@/lib/widgets/entries';

// Removed schedule rules; no schedule configuration shown in UI

// Preset color themes available for new buckets (12 options)
const PRESET_COLORS = {
  mint: {
    lightBg: '#E8F6EC', lightBorder: '#B8E1C4', lightText: '#1E6B3C',
    darkBg: '#223629', darkBorder: '#32543E', darkText: '#A9E3BC',
  },
  sky: {
    lightBg: '#EAF6FF', lightBorder: '#C7E7FF', lightText: '#1F5F8A',
    darkBg: '#1E3446', darkBorder: '#2D516A', darkText: '#A9D8FF',
  },
  purple: {
    lightBg: '#F1EAFE', lightBorder: '#D8C8FA', lightText: '#5E35A8',
    darkBg: '#2F2340', darkBorder: '#4A3770', darkText: '#D4C4F7',
  },
  orange: {
    lightBg: '#FFF4E6', lightBorder: '#F7D6B3', lightText: '#8A4B1F',
    darkBg: '#3A281B', darkBorder: '#5A3D2A', darkText: '#F2C9A1',
  },
  teal: {
    lightBg: '#E7F6F5', lightBorder: '#B7E2DF', lightText: '#1F5F5A',
    darkBg: '#1F3735', darkBorder: '#2E5551', darkText: '#A8E2DD',
  },
  pink: {
    lightBg: '#FFEAF3', lightBorder: '#F8C7DA', lightText: '#8A2757',
    darkBg: '#3C2432', darkBorder: '#5D364B', darkText: '#F3B8CF',
  },
  gold: {
    lightBg: '#FFF7E6', lightBorder: '#F3E0B5', lightText: '#7A5A1E',
    darkBg: '#3A301D', darkBorder: '#5A4A2D', darkText: '#EED59A',
  },
  indigo: {
    lightBg: '#EAEFFD', lightBorder: '#C6D0FA', lightText: '#2B3F8C',
    darkBg: '#202845', darkBorder: '#303D6E', darkText: '#B8C3F3',
  },
  red: {
    lightBg: '#FDEAEA', lightBorder: '#F7C4C4', lightText: '#8C2B2B',
    darkBg: '#402020', darkBorder: '#6B3030', darkText: '#F3B8B8',
  },
  slate: {
    lightBg: '#EEF1F5', lightBorder: '#D3DAE5', lightText: '#2E3A4A',
    darkBg: '#232A36', darkBorder: '#38475C', darkText: '#C5D0E3',
  },
  lime: {
    lightBg: '#F3FBE6', lightBorder: '#D8EDB0', lightText: '#48681A',
    darkBg: '#2A3521', darkBorder: '#3D5130', darkText: '#D3E8A6',
  },
  brown: {
    lightBg: '#F7EEE8', lightBorder: '#E3CDC0', lightText: '#6E3C26',
    darkBg: '#3A2920', darkBorder: '#5A3D30', darkText: '#E6CBB9',
  },

} as const;
type PresetKey = keyof typeof PRESET_COLORS;

const PRESET_COLOR_KEYS = Object.keys(PRESET_COLORS) as PresetKey[];

function presetTone(key: PresetKey, colorScheme: 'light' | 'dark') {
  const c = PRESET_COLORS[key];
  return colorScheme === 'dark'
    ? { bg: c.darkBg, border: c.darkBorder, text: c.darkText }
    : { bg: c.lightBg, border: c.lightBorder, text: c.lightText };
}

function normalizePresetKey(value: string): PresetKey {
  return PRESET_COLOR_KEYS.includes(value as PresetKey)
    ? (value as PresetKey)
    : PRESET_COLOR_KEYS[0];
}

function isEchoDue(nextDueAt: string): boolean {
  const dueDate = new Date(nextDueAt);
  if (Number.isNaN(dueDate.getTime())) return true;
  return dueDate.getTime() <= Date.now();
}

function formatNextEchoDate(nextDueAt: string): string {
  const date = new Date(nextDueAt);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  if (date.getTime() <= Date.now()) return 'Due now';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function formatEchoProgress(note: Note): string {
  const total = Math.max(note.echo.scheduledDates.length, note.echo.occurrenceCount);
  return `${note.echo.occurrenceCount}/${total}`;
}

function notePreview(note: Note): string {
  return note.body.replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ').trim() || note.title;
}

export default function EchoScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const palette = Colors[colorScheme];
  const router = useRouter();
  const {
    recent,
    reviewed,
    bucketPreferences,
    standingMessages,
    addCustomBucketDraft,
    updateCustomBucketDraft,
    deleteCustomBucketDraft,
    deleteRecentNote,
    deleteReviewedNote,
    upsertStandingMessage,
    deleteStandingMessage,
    widgetPreferences,
    setWidgetEnabled,
    setWidgetStandingMessagesEnabled,
  } = useNotes();
  const { standingAction, standingId, standingText, standingNonce } = useLocalSearchParams<{
    standingAction?: string;
    standingId?: string;
    standingText?: string;
    standingNonce?: string;
  }>();

  // Modal + new bucket state
  const [bucketModalOpen, setBucketModalOpen] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');
  const [newBucketDescription, setNewBucketDescription] = useState('');
  const [selectedColorKey, setSelectedColorKey] = useState<PresetKey | null>(null);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  // Inspect/edit modal state
  const [inspectOpen, setInspectOpen] = useState(false);
  const [activeBucket, setActiveBucket] = useState<{ type: 'custom'; index: number } | null>(null);
  const [inspectName, setInspectName] = useState('');
  const [inspectDescription, setInspectDescription] = useState('');
  const [inspectColorKey, setInspectColorKey] = useState<PresetKey | null>(null);
  const [inspectColorMenuOpen, setInspectColorMenuOpen] = useState(false);
  const [queueRowSizes, setQueueRowSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [standingRowSizes, setStandingRowSizes] = useState<Record<string, { width: number; height: number }>>({});

  const customBuckets = bucketPreferences.customs;

  const isColorAvailable = useCallback(
    (
      colorKey: PresetKey,
      exceptBucket?: { type: 'custom'; index: number }
    ) => {
      const usedByCustom = customBuckets.some(
        (bucket, index) => exceptBucket?.type !== 'custom' || exceptBucket.index !== index
          ? bucket.colorKey === colorKey
          : false
      );

      return !usedByCustom;
    },
    [customBuckets]
  );
  const nextAvailableColorKey = useCallback(
    (exceptBucket?: { type: 'custom'; index: number }) =>
      PRESET_COLOR_KEYS.find((key) => isColorAvailable(key, exceptBucket)) ?? PRESET_COLOR_KEYS[0],
    [isColorAvailable]
  );

  const openNewBucket = useCallback(() => {
    setSelectedColorKey((current) => current ?? nextAvailableColorKey());
    setColorMenuOpen(false);
    setBucketModalOpen(true);
  }, [nextAvailableColorKey]);

  const openCustom = useCallback((index: number) => {
    const b = customBuckets[index];
    if (!b) return;
    setActiveBucket({ type: 'custom', index });
    setInspectName(b.name);
    setInspectDescription(b.description);
    setInspectColorKey(normalizePresetKey(b.colorKey));
    setInspectColorMenuOpen(false);
    setInspectOpen(true);
  }, [customBuckets]);

  useEffect(() => {
    if (standingAction !== 'upsert' && standingAction !== 'delete') return;

    const parsedId = typeof standingId === 'string' ? Number.parseInt(standingId, 10) : NaN;
    const hasValidId = Number.isInteger(parsedId) && parsedId >= 0;

    if (standingAction === 'delete') {
      if (hasValidId) {
        const message = standingMessages[parsedId];
        if (message) deleteStandingMessage(message.id);
      }
      router.replace('/echo');
      return;
    }

    if (typeof standingText === 'string') {
      const trimmed = standingText.trim();
      if (trimmed.length > 0) {
        upsertStandingMessage(hasValidId ? standingMessages[parsedId]?.id ?? null : null, trimmed);
      }
    }

    router.replace('/echo');
  }, [
    deleteStandingMessage,
    router,
    standingAction,
    standingId,
    standingMessages,
    standingText,
    standingNonce,
    upsertStandingMessage,
  ]);

  const bucketSummary = useMemo(() => {
    const allNotes = [...recent, ...reviewed];
    return customBuckets.map((bucket, index) => ({
      bucket,
      index,
      count: allNotes.filter((note) => note.bucket === bucket.name).length,
    }));
  }, [customBuckets, recent, reviewed]);

  const todayEchoes = useMemo(() => {
    const allNotes = [...recent, ...reviewed];
    return allNotes
      .filter((note) => note.echo.enabled && note.bucket === null && isEchoDue(note.echo.nextDueAt))
      .sort((a, b) => a.echo.nextDueAt.localeCompare(b.echo.nextDueAt))
      .slice(0, 3)
      .map((note) => ({
        id: note.id,
        text: note.body,
      }));
  }, [recent, reviewed]);
  const widgetPreviewEntries = useMemo(
    () =>
      createWidgetEntries({
        recent,
        reviewed,
        checkIns: [],
        deletedNotes: [],
        bucketPreferences,
        standingMessages,
        widgetPreferences: {
          ...widgetPreferences,
          enabled: true,
        },
      }),
    [bucketPreferences, recent, reviewed, standingMessages, widgetPreferences]
  );
  const echoQueue = useMemo(
    () =>
      [
        ...recent.map((note) => ({ note, list: 'recent' as const })),
        ...reviewed.map((note) => ({ note, list: 'reviewed' as const })),
      ]
        .filter(({ note }) => note.echo.enabled && note.bucket === null)
        .sort((a, b) => a.note.echo.nextDueAt.localeCompare(b.note.echo.nextDueAt)),
    [recent, reviewed]
  );
  const openWidgetEntry = useCallback(
    (entry: WidgetEntry) => {
      if (entry.kind === 'echo' && entry.noteId) {
        router.push({ pathname: '/note/[noteId]', params: { noteId: entry.noteId } });
        return;
      }

      if (entry.kind === 'standing' && entry.standingMessageId) {
        router.push({
          pathname: '/standing/[standingMessageId]',
          params: { standingMessageId: entry.standingMessageId },
        });
      }
    },
    [router]
  );

  const deleteEchoQueueItem = useCallback(
    (item: (typeof echoQueue)[number]) => {
      if (item.list === 'recent') {
        deleteRecentNote(item.note.id);
        return;
      }

      deleteReviewedNote(item.note.id);
    },
    [deleteRecentNote, deleteReviewedNote]
  );

  const onQueueRowLayout = useCallback(
    (noteId: string) => (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setQueueRowSizes((prev) => {
        const existing = prev[noteId];
        if (existing?.width === width && existing.height === height) return prev;
        return { ...prev, [noteId]: { width, height } };
      });
    },
    []
  );

  const onStandingRowLayout = useCallback(
    (messageId: string) => (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setStandingRowSizes((prev) => {
        const existing = prev[messageId];
        if (existing?.width === width && existing.height === height) return prev;
        return { ...prev, [messageId]: { width, height } };
      });
    },
    []
  );

  return (
    <GestureHandlerRootView style={styles.screen}>
      <ThemedView style={[styles.screen, { paddingTop: insets.top }]}> 
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}> 
        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ fontSize: 18 }}>
            Categories
          </ThemedText>

          {/* Buckets grid */}
          <View style={styles.bucketGrid}>
            {bucketSummary.map(({ bucket, index, count }) => {
              const tone = presetTone(normalizePresetKey(bucket.colorKey), colorScheme);
              return (
                <Pressable
                  key={`custom-${bucket.name}`}
                  onPress={() => openCustom(index)}
                  style={({ pressed }) => [
                    styles.bucketCard,
                    { backgroundColor: tone.bg, borderColor: tone.border, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <ThemedText style={{ fontSize: 15, color: tone.text }}>{bucket.name}</ThemedText>
                  <ThemedText style={{ color: tone.text, marginTop: 6, fontSize: 13 }}>
                    {count} notes
                  </ThemedText>
                </Pressable>
              );
            })}

            {/* Add bucket card */}
            <Pressable
              onPress={openNewBucket}
              style={({ pressed }) => [
                styles.bucketCard,
                styles.addBucketCard,
                { borderColor: palette.border, backgroundColor: palette.surfaceAlt, opacity: pressed ? 0.7 : 1, borderStyle: 'dashed' },
              ]}
            >
              <ThemedText style={{ fontSize: 28, color: palette.muted }}>+</ThemedText>
            </Pressable>
          </View>

          {/* New bucket modal */}
          <Modal visible={bucketModalOpen} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <ThemedText type="subtitle" style={{ fontSize: 18, marginBottom: 6 }}>
                  New Bucket
                </ThemedText>

                <View style={styles.nameColorRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontSize: 13, marginBottom: 6 }}>Name</ThemedText>
                    <TextInput
                      placeholder="e.g., Research"
                      value={newBucketName}
                      onChangeText={setNewBucketName}
                      placeholderTextColor={palette.muted}
                      style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surfaceAlt }]}
                    />
                  </View>
                  <View style={styles.colorDropdownWrap}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.colorDropdownTrigger,
                        {
                          backgroundColor: palette.surfaceAlt,
                          borderColor: palette.border,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                      onPress={(e) => { e.stopPropagation(); setColorMenuOpen((o) => !o); }}
                    >
                      <View
                        style={[
                          // Match option chip style but keep original trigger size
                          styles.colorChip,
                          { width: 20, height: 20, borderWidth: 2 },
                          selectedColorKey
                            ? {
                                backgroundColor: presetTone(selectedColorKey, colorScheme).bg,
                                borderColor: presetTone(selectedColorKey, colorScheme).border,
                              }
                            : { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
                        ]}
                      />
                    </Pressable>
                    {colorMenuOpen ? (
                      <Pressable onPress={(e) => e.stopPropagation()} style={[styles.colorDropdownMenu, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        {Object.keys(PRESET_COLORS).map((key) => {
                          const k = key as PresetKey;
                          const disabled = !isColorAvailable(k);
                          const tone = presetTone(k, colorScheme);
                          return (
                            <Pressable
                              key={`opt-${k}`}
                              disabled={disabled}
                              onPress={(e) => {
                                e.stopPropagation();
                                setSelectedColorKey(k);
                                setColorMenuOpen(false);
                              }}
                              style={[
                                styles.colorChip,
                                {
                                  backgroundColor: tone.bg,
                                  borderColor: tone.border,
                                  opacity: disabled ? 0.38 : 1,
                                },
                              ]}
                            >
                              {disabled ? (
                                <View style={[styles.colorTakenSlash, { backgroundColor: palette.text }]} />
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <ThemedText style={{ fontSize: 13, marginTop: 12, marginBottom: 6 }}>Description</ThemedText>
                <TextInput
                  placeholder="What belongs here?"
                  value={newBucketDescription}
                  onChangeText={setNewBucketDescription}
                  placeholderTextColor={palette.muted}
                  style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surfaceAlt, height: 120, textAlignVertical: 'top' }]}
                  multiline
                />

                <View style={styles.modalActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionBtn,
                      { borderColor: palette.border, backgroundColor: palette.surfaceAlt, opacity: pressed ? 0.7 : 1 },
                    ]}
                    onPress={() => setBucketModalOpen(false)}
                  >
                    <ThemedText style={{ color: palette.text }}>Cancel</ThemedText>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionBtn,
                      { borderColor: palette.border, backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 },
                    ]}
                    onPress={() => {
                      const colorKey = selectedColorKey ?? nextAvailableColorKey();
                      if (!newBucketName.trim()) return;
                      if (!isColorAvailable(colorKey)) return;
                      addCustomBucketDraft({
                        name: newBucketName.trim(),
                        description: newBucketDescription.trim(),
                        colorKey,
                      });
                      setNewBucketName('');
                      setNewBucketDescription('');
                      setSelectedColorKey(null);
                      setBucketModalOpen(false);
                    }}
                  >
                    <ThemedText style={{ color: palette.text }}>Save</ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </View>

        {/* Inspect/Edit bucket modal */}
        <Modal visible={inspectOpen} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            {activeBucket ? (
              <View style={[styles.modalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
                {(() => {
                  const activeCustomBucket = customBuckets[activeBucket.index];
                  if (!activeCustomBucket) return null;
                  return (
                    <>
                      <View style={styles.nameColorRow}>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={{ fontSize: 13, marginBottom: 6 }}>Name</ThemedText>
                          <TextInput
                            placeholder="Bucket name"
                            value={inspectName}
                            onChangeText={setInspectName}
                            placeholderTextColor={palette.muted}
                            style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surfaceAlt }]}
                          />
                        </View>
                        <View style={styles.colorDropdownWrap}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.colorDropdownTrigger,
                              {
                                backgroundColor: palette.surfaceAlt,
                                borderColor: palette.border,
                                opacity: pressed ? 0.7 : 1,
                              },
                            ]}
                            onPress={(e) => { e.stopPropagation(); setInspectColorMenuOpen((o) => !o); }}
                          >
                            <View
                              style={[
                                // Match option chip style but keep original trigger size
                                styles.colorChip,
                                { width: 20, height: 20, borderWidth: 2 },
                                inspectColorKey
                                  ? {
                                      backgroundColor: presetTone(inspectColorKey, colorScheme).bg,
                                      borderColor: presetTone(inspectColorKey, colorScheme).border,
                                    }
                                  : { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
                              ]}
                            />
                          </Pressable>
                          {inspectColorMenuOpen ? (
                            <Pressable onPress={(e) => e.stopPropagation()} style={[styles.colorDropdownMenu, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                              {Object.keys(PRESET_COLORS).map((key) => {
                                const k = key as PresetKey;
                                const disabled = !isColorAvailable(k, activeBucket);
                                const toneOpt = presetTone(k, colorScheme);
                                return (
                                  <Pressable
                                    key={`opt-${k}`}
                                    disabled={disabled}
                                    onPress={(e) => {
                                      e.stopPropagation();
                                      setInspectColorKey(k);
                                      setInspectColorMenuOpen(false);
                                    }}
                                    style={[
                                      styles.colorChip,
                                      { backgroundColor: toneOpt.bg, borderColor: toneOpt.border, opacity: disabled ? 0.38 : 1 },
                                    ]}
                                  >
                                    {disabled ? (
                                      <View style={[styles.colorTakenSlash, { backgroundColor: palette.text }]} />
                                    ) : null}
                                  </Pressable>
                                );
                              })}
                            </Pressable>
                          ) : null}
                        </View>
                      </View>

                      <ThemedText style={{ fontSize: 13, marginTop: 12, marginBottom: 6 }}>Description</ThemedText>
                      <TextInput
                        placeholder="What belongs here?"
                        value={inspectDescription}
                        onChangeText={setInspectDescription}
                        placeholderTextColor={palette.muted}
                        style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surfaceAlt, height: 120, textAlignVertical: 'top' }]}
                        multiline
                      />

                      <View style={styles.inspectModalActions}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.actionBtn,
                            {
                              borderColor: '#C44E4E',
                              backgroundColor: palette.surfaceAlt,
                              opacity: pressed ? 0.7 : 1,
                            },
                          ]}
                          onPress={() => {
                            Alert.alert(
                              'Delete bucket?',
                              `Delete "${inspectName.trim() || activeCustomBucket?.name || 'this bucket'}"?`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Delete',
                                  style: 'destructive',
                                  onPress: () => {
                                    deleteCustomBucketDraft(activeBucket.index);
                                    setInspectOpen(false);
                                    setActiveBucket(null);
                                    setInspectName('');
                                    setInspectDescription('');
                                    setInspectColorKey(null);
                                    setInspectColorMenuOpen(false);
                                  },
                                },
                              ]
                            );
                          }}
                        >
                          <ThemedText style={{ color: '#C44E4E' }}>Delete</ThemedText>
                        </Pressable>
                        <View style={styles.modalActionGroup}>
                          <Pressable
                            style={({ pressed }) => [styles.actionBtn, { borderColor: palette.border, backgroundColor: palette.surfaceAlt, opacity: pressed ? 0.7 : 1 }]}
                            onPress={() => setInspectOpen(false)}
                          >
                            <ThemedText style={{ color: palette.text }}>Close</ThemedText>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [styles.actionBtn, { borderColor: palette.border, backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 }]}
                            onPress={() => {
                              const colorKey = inspectColorKey ?? PRESET_COLOR_KEYS[0];
                              const nextDraft = {
                                name: inspectName.trim(),
                                description: inspectDescription.trim(),
                                colorKey,
                              };
                              if (!nextDraft.name) return;
                              if (!isColorAvailable(colorKey, activeBucket)) return;
                              updateCustomBucketDraft(activeBucket.index, nextDraft);
                              setInspectOpen(false);
                            }}
                          >
                            <ThemedText style={{ color: palette.text }}>Save</ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  );
                })()}
              </View>
            ) : null}
          </View>
        </Modal>
        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ fontSize: 18 }}>
            Today
          </ThemedText>
          <View style={styles.echoStack}>
            {todayEchoes.map((echo, index) => (
              <Pressable
                key={`${echo.id}-${index}`}
                onPress={() =>
                  router.push({
                    pathname: '/note/[noteId]',
                    params: { noteId: echo.id },
                  })
                }
                style={({ pressed }) => [
                  styles.echoCard,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <ThemedText style={styles.noteTitle} numberOfLines={1}>
                  {echo.text}
                </ThemedText>
              </Pressable>
            ))}
            <View style={[styles.echoCard, styles.emptyEcho, { borderColor: palette.border, backgroundColor: palette.surfaceAlt }]}>
              <ThemedText style={{ color: palette.muted }}>
                No more echoes today. Max 3 per day.
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText type="subtitle" style={{ fontSize: 18 }}>
              Widget Preview
            </ThemedText>
            <Pressable
              onPress={() => setWidgetEnabled(!widgetPreferences.enabled)}
              style={({ pressed }) => [
                styles.togglePill,
                {
                  borderColor: palette.border,
                  backgroundColor: widgetPreferences.enabled ? Colors[colorScheme].accentSoft : palette.surfaceAlt,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <ThemedText style={{
                color: widgetPreferences.enabled ? Colors[colorScheme].accent : palette.text,
                fontWeight: '600',
                fontSize: 12,
                lineHeight: 14,
              }}>
                {widgetPreferences.enabled ? 'On' : 'Off'}
              </ThemedText>
            </Pressable>
          </View>
          <View style={[styles.widgetCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            {widgetPreviewEntries.map((entry, index) =>
              entry.targetUrl ? (
                <Pressable
                  key={entry.id}
                  onPress={() => openWidgetEntry(entry)}
                  style={({ pressed }) => [styles.previewRow, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <ThemedText style={{ fontSize: 13, color: palette.text, flex: 1 }}>
                    {index + 1}. {entry.text}
                  </ThemedText>
                </Pressable>
              ) : (
                <View key={entry.id} style={styles.previewRow}>
                  <ThemedText style={{ fontSize: 13, color: palette.muted, flex: 1 }}>
                    {entry.text}
                  </ThemedText>
                </View>
              )
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText type="subtitle" style={{ fontSize: 18 }}>
              Standing Messages
            </ThemedText>
            <Pressable
              onPress={() =>
                setWidgetStandingMessagesEnabled(!widgetPreferences.includeStandingMessages)
              }
              style={({ pressed }) => [
                styles.togglePill,
                {
                  borderColor: palette.border,
                  backgroundColor: widgetPreferences.includeStandingMessages ? Colors[colorScheme].accentSoft : palette.surfaceAlt,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <ThemedText style={{
                color: widgetPreferences.includeStandingMessages ? Colors[colorScheme].accent : palette.text,
                fontWeight: '600',
                fontSize: 12,
                lineHeight: 14,
              }}>
                {widgetPreferences.includeStandingMessages ? 'On' : 'Off'}
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.standingRow}>
            {standingMessages.map((message) => {
              const standingSize = standingRowSizes[message.id];
              const actionWidth = standingSize?.width ?? 0;
              const actionHeight = standingSize?.height ?? 44;

              return (
                <Swipeable
                  key={message.id}
                  friction={1.1}
                  leftThreshold={actionWidth ? Math.min(120, Math.max(60, actionWidth * 0.25)) : 60}
                  overshootLeft={false}
                  containerStyle={{ overflow: 'visible' }}
                  childrenContainerStyle={{ overflow: 'visible' }}
                  renderLeftActions={(_progress, dragX) => {
                    if (!standingSize) return null;
                    const translateIn = dragX.interpolate({
                      inputRange: [0, actionWidth],
                      outputRange: [-actionWidth, 0],
                      extrapolate: 'clamp',
                    });

                    return (
                      <View
                        style={[
                          styles.standingSwipeDeleteContainer,
                          {
                            width: actionWidth,
                            height: actionHeight,
                          },
                        ]}
                      >
                        <Animated.View
                          style={[
                            styles.standingSwipeDeleteFill,
                            {
                              width: actionWidth,
                              transform: [{ translateX: translateIn }],
                              backgroundColor: colorScheme === 'dark' ? '#452323' : '#FDEAEA',
                              borderColor: colorScheme === 'dark' ? '#6B3535' : '#F2C6C6',
                            },
                          ]}
                        >
                          <ThemedText style={{ color: colorScheme === 'dark' ? '#F2B8B5' : '#8C2B2B', fontSize: 13 }}>
                            Delete
                          </ThemedText>
                        </Animated.View>
                      </View>
                    );
                  }}
                  onSwipeableOpen={(direction) => {
                    if (direction === 'left') deleteStandingMessage(message.id);
                  }}
                >
                  <Pressable
                    onLayout={onStandingRowLayout(message.id)}
                    onPress={() =>
                      router.push({
                        pathname: '/standing/[standingMessageId]',
                        params: { standingMessageId: message.id },
                      })
                    }
                    style={({ pressed }) => [
                      styles.standingCard,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <ThemedText style={{ fontSize: 14 }}>{message.text}</ThemedText>
                  </Pressable>
                </Swipeable>
              );
            })}
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/standing/[standingMessageId]',
                  params: { standingMessageId: 'new' },
                })
              }
              style={({ pressed }) => [
                styles.standingCard,
                styles.addStanding,
                {
                  backgroundColor: palette.surfaceAlt,
                  borderColor: palette.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <ThemedText style={{ fontSize: 14, color: palette.muted }}>+ Add message</ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText type="subtitle" style={{ fontSize: 18 }}>
              Echo Queue
            </ThemedText>
            <ThemedText style={{ color: palette.muted, fontSize: 12 }}>
              {echoQueue.length} notes
            </ThemedText>
          </View>
          <View style={styles.queueStack}>
            {echoQueue.map((item) => {
              const { note } = item;
              const queueSize = queueRowSizes[note.id];
              const actionWidth = queueSize?.width ?? 0;
              const actionHeight = queueSize?.height ?? 68;
              return (
                <Swipeable
                  key={note.id}
                  friction={1.1}
                  leftThreshold={actionWidth ? Math.min(120, Math.max(60, actionWidth * 0.25)) : 60}
                  overshootLeft={false}
                  containerStyle={{ overflow: 'visible' }}
                  childrenContainerStyle={{ overflow: 'visible' }}
                  renderLeftActions={(_progress, dragX) => {
                    if (!queueSize) return null;
                    const translateIn = dragX.interpolate({
                      inputRange: [0, actionWidth],
                      outputRange: [-actionWidth, 0],
                      extrapolate: 'clamp',
                    });

                    return (
                      <View
                        style={[
                          styles.queueSwipeDeleteContainer,
                          {
                            width: actionWidth,
                            height: actionHeight,
                          },
                        ]}
                      >
                        <Animated.View
                          style={[
                            styles.queueSwipeDeleteFill,
                            {
                              width: actionWidth,
                              transform: [{ translateX: translateIn }],
                              backgroundColor: colorScheme === 'dark' ? '#452323' : '#FDEAEA',
                              borderColor: colorScheme === 'dark' ? '#6B3535' : '#F2C6C6',
                            },
                          ]}
                        >
                          <ThemedText style={{ color: colorScheme === 'dark' ? '#F2B8B5' : '#8C2B2B', fontSize: 13 }}>
                            Delete
                          </ThemedText>
                        </Animated.View>
                      </View>
                    );
                  }}
                  onSwipeableOpen={(direction) => {
                    if (direction === 'left') deleteEchoQueueItem(item);
                  }}
                >
                  <Pressable
                    onLayout={onQueueRowLayout(note.id)}
                    onPress={() =>
                      router.push({
                        pathname: '/note/[noteId]',
                        params: { noteId: note.id },
                      })
                    }
                    style={({ pressed }) => [
                      styles.queueCard,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <View style={styles.queueMain}>
                      <View style={styles.queueTitleWrap}>
                        <ThemedText style={styles.queueTitle} numberOfLines={1}>
                          {notePreview(note)}
                        </ThemedText>
                      </View>
                      <View style={styles.queueMetaColumn}>
                        <ThemedText style={{ color: palette.muted, fontSize: 12 }} numberOfLines={1}>
                          {formatNextEchoDate(note.echo.nextDueAt)}
                        </ThemedText>
                        <ThemedText style={{ color: palette.muted, fontSize: 12 }} numberOfLines={1}>
                          {formatEchoProgress(note)}
                        </ThemedText>
                      </View>
                    </View>
                  </Pressable>
                </Swipeable>
              );
            })}
            {echoQueue.length === 0 ? (
              <View
                style={[
                  styles.queueCard,
                  styles.emptyEcho,
                  { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
                ]}
              >
                <ThemedText style={{ color: palette.muted }}>No echo notes queued.</ThemedText>
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
  content: {
    paddingHorizontal: 20,
    gap: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    marginTop: 16,
  },
  section: {
    gap: 12,
  },
  bucketWrap: {
    position: 'relative',
    zIndex: 2,
  },
  bucketTrigger: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bucketDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  bucketMenu: {
    position: 'absolute',
    top: 44,
    left: 0,
    minWidth: 220,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  bucketOption: {
    paddingHorizontal: 10,
    paddingVertical: 4,
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
  bucketGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  bucketCard: {
    width: '47%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    minHeight: 84,
    justifyContent: 'space-between',
  },
  addBucketCard: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  echoStack: {
    gap: 12,
  },
  echoCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  queueStack: {
    gap: 10,
  },
  queueCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    minHeight: 68,
  },
  queueSwipeDeleteContainer: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    overflow: 'hidden',
    borderRadius: 16,
  },
  queueSwipeDeleteFill: {
    height: '100%',
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueMain: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  queueTitleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  queueTitle: {
    fontSize: 15,
    lineHeight: 18,
  },
  queueMetaColumn: {
    width: 104,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    alignSelf: 'stretch',
  },
  emptyEcho: {
    borderStyle: 'dashed',
  },
  widgetCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    minHeight: 140,
    justifyContent: 'flex-start',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  standingRow: {
    gap: 10,
  },
  standingCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  standingSwipeDeleteContainer: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    overflow: 'hidden',
    borderRadius: 16,
  },
  standingSwipeDeleteFill: {
    height: '100%',
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStanding: {
    borderStyle: 'dashed',
  },
  scheduleList: {
    gap: 10,
  },
  scheduleRow: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    overflow: 'visible',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
  inspectModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  modalActionGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  togglePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 44,
    alignItems: 'center',
  },
  nameColorRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  colorDropdownWrap: {
    position: 'relative',
    zIndex: 50,
  },
  colorDropdownTrigger: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
  colorDropdownMenu: {
    position: 'absolute',
    top: 44,
    right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    // Force an exact 4x3 grid: 4 chips (28px) + 3 gaps (8px) + padding (10px x2) + borders (1px x2) = 158
    width: 158,
    zIndex: 100,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  colorChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  colorChip: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  colorTakenSlash: {
    position: 'absolute',
    top: 12,
    left: -5,
    width: 38,
    height: 3,
    borderRadius: 999,
    transform: [{ rotate: '-45deg' }],
  },
});
