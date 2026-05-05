import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
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
  const router = useRouter();
  const palette = Colors[colorScheme];
  const { checkIns } = useNotes();
  const recentCheckIns = useMemo(() => checkIns.slice(0, 8), [checkIns]);

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
            data: { url: '/checkin-flow' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 20,
            minute: 0,
          },
        });
      } catch {
        // Manual check-ins still work if notifications are unavailable.
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <ThemedView style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <ThemedText type="subtitle" style={{ fontSize: 18 }}>
              Recent Check-ins
            </ThemedText>
            <ThemedText style={{ color: palette.muted, fontSize: 14 }}>
              Start a new entry when you want to log the day.
            </ThemedText>
          </View>
          <Pressable
            accessibilityLabel="Start new check-in"
            onPress={() => router.push('/checkin-flow')}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: palette.accent,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <ThemedText style={styles.addButtonText}>+</ThemedText>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.historyStack}
          keyboardShouldPersistTaps="handled">
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
                ]}>
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
                styles.emptyCard,
                { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
              ]}>
              <ThemedText style={{ color: palette.muted, textAlign: 'center' }}>
                No check-ins yet.
              </ThemedText>
              <ThemedText style={{ color: palette.muted, textAlign: 'center', fontSize: 14 }}>
                Tap the plus button to start your first one.
              </ThemedText>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerCopy: {
    flex: 1,
    gap: 6,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
    marginTop: -1,
  },
  historyStack: {
    gap: 10,
    paddingBottom: 8,
  },
  historyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    gap: 6,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
});
