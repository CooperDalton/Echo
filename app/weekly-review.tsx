import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Fonts } from '@/constants/theme';
import { useNotes } from '@/context/notes-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getPendingWeeklyReviewOccurrence,
  getPreviousWeeklyReview,
  isEveningCheckInDue,
} from '@/lib/weekly-reviews/schedule';

function formatReviewDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Weekly review';
  return `Week ending ${date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

export default function WeeklyReviewScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { reviewId, scheduledFor: scheduledForParam, source } = useLocalSearchParams<{
    reviewId?: string;
    scheduledFor?: string;
    source?: string;
  }>();
  const {
    checkIns,
    weeklyReviews,
    weeklyReviewPreferences,
    addWeeklyReview,
    updateWeeklyReview,
  } = useNotes();

  const existingReview = useMemo(
    () => weeklyReviews.find((review) => review.id === reviewId) ?? null,
    [reviewId, weeklyReviews]
  );
  const pendingOccurrence = useMemo(
    () => getPendingWeeklyReviewOccurrence(weeklyReviewPreferences, weeklyReviews),
    [weeklyReviewPreferences, weeklyReviews]
  );
  const scheduledFor = existingReview?.scheduledFor ??
    (typeof scheduledForParam === 'string' && !Number.isNaN(Date.parse(scheduledForParam))
      ? new Date(scheduledForParam).toISOString()
      : pendingOccurrence?.toISOString() ?? null);
  const previousReview = useMemo(
    () => (scheduledFor ? getPreviousWeeklyReview(weeklyReviews, scheduledFor) : null),
    [scheduledFor, weeklyReviews]
  );
  const [reflection, setReflection] = useState(existingReview?.reflection ?? '');
  const [nextWeekIntent, setNextWeekIntent] = useState(existingReview?.nextWeekIntent ?? '');

  useEffect(() => {
    // Review data can arrive after local hydration or sync while this modal is mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReflection(existingReview?.reflection ?? '');
    setNextWeekIntent(existingReview?.nextWeekIntent ?? '');
  }, [existingReview?.nextWeekIntent, existingReview?.reflection]);

  const canSave = Boolean(scheduledFor && reflection.trim() && nextWeekIntent.trim());
  const isEditing = existingReview !== null;

  function close() {
    router.back();
  }

  function save() {
    if (!canSave || !scheduledFor) return;

    if (existingReview) {
      updateWeeklyReview(existingReview.id, { reflection, nextWeekIntent });
      close();
      return;
    }

    const saved = addWeeklyReview({ scheduledFor, reflection, nextWeekIntent });
    if (!saved) return;

    if (source === 'prompt' && isEveningCheckInDue(checkIns)) {
      router.replace({ pathname: '/checkin-flow', params: { source: 'weekly-review' } });
      return;
    }
    close();
  }

  if (!scheduledFor) {
    return (
      <ThemedView style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.emptyState}>
          <IconSymbol name="checkmark.circle.fill" size={46} color={palette.accent} />
          <ThemedText type="title">You&apos;re caught up</ThemedText>
          <ThemedText style={{ color: palette.muted, textAlign: 'center' }}>
            There isn&apos;t a weekly review due right now.
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={close}
            style={[styles.primaryButton, { backgroundColor: palette.accent }]}
          >
            <ThemedText style={{ color: palette.background, fontWeight: '700' }}>Done</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={isEditing ? 'Cancel editing weekly review' : 'Not now'}
            hitSlop={8}
            onPress={close}
            style={[
              styles.iconButton,
              { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
            ]}
          >
            <IconSymbol name="xmark" size={18} color={palette.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <ThemedText type="subtitle">{isEditing ? 'Edit weekly review' : 'Weekly review'}</ThemedText>
            <ThemedText style={{ color: palette.muted, fontSize: 12 }}>
              {formatReviewDate(scheduledFor)}
            </ThemedText>
          </View>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {previousReview ? (
            <View
              style={[
                styles.previousCard,
                { backgroundColor: palette.accentSoft, borderColor: palette.border },
              ]}
            >
              <ThemedText style={[styles.previousLabel, { color: palette.accent }]}>
                From your last review
              </ThemedText>
              <ThemedText style={styles.previousText}>{previousReview.nextWeekIntent}</ThemedText>
            </View>
          ) : (
            <View
              style={[
                styles.previousCard,
                { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
              ]}
            >
              <ThemedText style={{ color: palette.muted }}>
                This is your first weekly review. Next time, your plan will appear here.
              </ThemedText>
            </View>
          )}

          <View style={styles.fieldGroup}>
            <ThemedText style={styles.fieldLabel}>How did this week go?</ThemedText>
            <TextInput
              accessibilityLabel="Reflection on how the week went"
              multiline
              placeholder="What stood out? What worked? What didn’t?"
              placeholderTextColor={palette.muted}
              value={reflection}
              onChangeText={setReflection}
              textAlignVertical="top"
              style={[
                styles.textArea,
                {
                  color: palette.text,
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  fontFamily: Fonts.sans,
                },
              ]}
            />
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText style={styles.fieldLabel}>What do you want to do next week?</ThemedText>
            <TextInput
              accessibilityLabel="Plan for next week"
              multiline
              placeholder="Name the few things you want to carry forward."
              placeholderTextColor={palette.muted}
              value={nextWeekIntent}
              onChangeText={setNextWeekIntent}
              textAlignVertical="top"
              style={[
                styles.textArea,
                {
                  color: palette.text,
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  fontFamily: Fonts.sans,
                },
              ]}
            />
          </View>
        </ScrollView>

        <View style={[styles.actions, { borderTopColor: palette.border }]}>
          {!isEditing ? (
            <Pressable
              accessibilityRole="button"
              onPress={close}
              style={[styles.secondaryButton, { borderColor: palette.border }]}
            >
              <ThemedText>Not now</ThemedText>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save weekly review"
            disabled={!canSave}
            onPress={save}
            style={[
              styles.primaryButton,
              { backgroundColor: palette.accent, opacity: canSave ? 1 : 0.45 },
            ]}
          >
            <ThemedText style={{ color: palette.background, fontWeight: '700' }}>
              Save review
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: 66,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: { flex: 1, alignItems: 'center', gap: 2 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPlaceholder: { width: 40 },
  content: { padding: 20, gap: 24, paddingBottom: 36 },
  previousCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
  previousLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  previousText: { fontSize: 16, lineHeight: 23 },
  fieldGroup: { gap: 10 },
  fieldLabel: { fontSize: 17, fontWeight: '700' },
  textArea: {
    minHeight: 150,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    fontSize: 16,
    lineHeight: 23,
  },
  actions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 999,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 36,
  },
});
