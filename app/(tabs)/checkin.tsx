import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useNotes } from '@/context/notes-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CHECK_IN_EMOTIONS, type CheckInEmotion } from '@/lib/notes/types';

const EMOTION_LABELS: Record<CheckInEmotion, string> = {
  happy: 'Happy',
  content: 'Content',
  excited: 'Excited',
  bliss: 'Bliss',
  anxious: 'Anxious',
  overwhelmed: 'Overwhelmed',
  sad: 'Sad',
  angry: 'Angry',
};

const EVENING_CHECK_IN_NOTIFICATION_ID = 'echo-evening-checkin';

function createEmptyEmotions(): Record<CheckInEmotion, boolean> {
  return CHECK_IN_EMOTIONS.reduce(
    (result, emotion) => ({ ...result, [emotion]: false }),
    {} as Record<CheckInEmotion, boolean>
  );
}

function formatCheckInDate(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Saved check-in';

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CheckInScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const palette = Colors[colorScheme];
  const { checkIns, addCheckIn } = useNotes();
  const [energy, setEnergy] = useState(3);
  const [emotions, setEmotions] = useState(createEmptyEmotions);
  const [body, setBody] = useState('');

  const selectedEmotionCount = useMemo(
    () => CHECK_IN_EMOTIONS.filter((emotion) => emotions[emotion]).length,
    [emotions]
  );
  const canSave = body.trim().length > 0 || selectedEmotionCount > 0;
  const recentCheckIns = checkIns.slice(0, 4);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const currentPermissions = await Notifications.getPermissionsAsync();
        const finalPermissions = currentPermissions.granted
          ? currentPermissions
          : await Notifications.requestPermissionsAsync();

        if (!isMounted || !finalPermissions.granted) return;

        await Notifications.cancelScheduledNotificationAsync(EVENING_CHECK_IN_NOTIFICATION_ID);
        await Notifications.scheduleNotificationAsync({
          identifier: EVENING_CHECK_IN_NOTIFICATION_ID,
          content: {
            title: 'Daily check-in',
            body: 'Capture your energy, emotions, and what happened today.',
            data: { url: '/checkin' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 20,
            minute: 0,
          },
        });
      } catch {
        // The check-in screen still works manually when notifications are unavailable.
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  function resetForm() {
    setEnergy(3);
    setEmotions(createEmptyEmotions());
    setBody('');
  }

  function saveCheckIn() {
    if (!canSave) return;

    addCheckIn({
      kind: 'evening',
      energy,
      emotions,
      body,
    });
    resetForm();
  }

  return (
    <ThemedView style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}
      >
        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ fontSize: 18 }}>
            Daily Check-in
          </ThemedText>
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <ThemedText style={styles.label}>Energy</ThemedText>
            <View style={styles.energyRow}>
              {[1, 2, 3, 4, 5].map((value) => {
                const selected = value === energy;
                return (
                  <Pressable
                    key={value}
                    accessibilityLabel={`Energy ${value}`}
                    onPress={() => setEnergy(value)}
                    style={({ pressed }) => [
                      styles.energyButton,
                      {
                        backgroundColor: selected ? palette.accent : palette.surfaceAlt,
                        borderColor: selected ? palette.accent : palette.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <ThemedText
                      style={{
                        color: selected ? palette.background : palette.text,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {value}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <ThemedText style={[styles.label, { marginTop: 18 }]}>How are you feeling?</ThemedText>
            <View style={styles.emotionGrid}>
              {CHECK_IN_EMOTIONS.map((emotion) => {
                const selected = emotions[emotion];
                return (
                  <Pressable
                    key={emotion}
                    onPress={() =>
                      setEmotions((prev) => ({ ...prev, [emotion]: !prev[emotion] }))
                    }
                    style={({ pressed }) => [
                      styles.emotionChip,
                      {
                        backgroundColor: selected ? Colors[colorScheme].accentSoft : palette.surfaceAlt,
                        borderColor: selected ? palette.accent : palette.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <ThemedText
                      style={{
                        color: selected ? palette.accent : palette.text,
                        fontSize: 13,
                        fontWeight: selected ? '600' : '400',
                      }}
                    >
                      {EMOTION_LABELS[emotion]}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <ThemedText style={[styles.label, { marginTop: 18 }]}>What did you do today?</ThemedText>
            <TextInput
              multiline
              placeholder="Write a few sentences about the day."
              placeholderTextColor={palette.muted}
              value={body}
              onChangeText={setBody}
              textAlignVertical="top"
              style={[
                styles.textArea,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surfaceAlt,
                  color: palette.text,
                  fontFamily: Fonts.sans,
                },
              ]}
            />

            <Pressable
              disabled={!canSave}
              onPress={saveCheckIn}
              style={({ pressed }) => [
                styles.saveButton,
                {
                  backgroundColor: palette.accent,
                  opacity: pressed || !canSave ? 0.65 : 1,
                },
              ]}
            >
              <ThemedText style={{ color: palette.background, fontWeight: '600' }}>
                Save check-in
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ fontSize: 18 }}>
            Recent Check-ins
          </ThemedText>
          <View style={styles.historyStack}>
            {recentCheckIns.map((checkIn) => {
              const activeEmotions = CHECK_IN_EMOTIONS.filter((emotion) => checkIn.emotions[emotion])
                .map((emotion) => EMOTION_LABELS[emotion])
                .join(', ');

              return (
                <View
                  key={checkIn.id}
                  style={[
                    styles.historyCard,
                    { backgroundColor: palette.surface, borderColor: palette.border },
                  ]}
                >
                  <View style={styles.historyHeader}>
                    <ThemedText style={{ fontSize: 14, fontWeight: '600' }}>
                      Energy {checkIn.energy}/5
                    </ThemedText>
                    <ThemedText style={{ color: palette.muted, fontSize: 12 }}>
                      {formatCheckInDate(checkIn.createdAt)}
                    </ThemedText>
                  </View>
                  {activeEmotions ? (
                    <ThemedText style={{ color: palette.muted, fontSize: 13 }}>
                      {activeEmotions}
                    </ThemedText>
                  ) : null}
                  {checkIn.body ? (
                    <ThemedText style={{ color: palette.text, fontSize: 14 }}>
                      {checkIn.body}
                    </ThemedText>
                  ) : null}
                </View>
              );
            })}

            {recentCheckIns.length === 0 ? (
              <View
                style={[
                  styles.historyCard,
                  { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
                ]}
              >
                <ThemedText style={{ color: palette.muted }}>
                  No check-ins yet.
                </ThemedText>
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
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  energyRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  energyButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emotionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  emotionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 140,
    padding: 12,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 10,
  },
  saveButton: {
    borderRadius: 999,
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 16,
  },
  historyStack: {
    gap: 10,
  },
  historyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
});
