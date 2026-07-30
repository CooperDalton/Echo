import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Modal,
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
import { canSendNotifications } from '@/lib/notifications/permissions';
import { CHECK_IN_EMOTIONS, type CheckIn, type CheckInEmotion } from '@/lib/notes/types';

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

const EMOTION_EMOJIS: Record<CheckInEmotion, string> = {
  happy: '\u{1F642}',
  content: '\u{1F60C}',
  excited: '\u{1F929}',
  bliss: '\u{1F601}',
  anxious: '\u{1F62C}',
  overwhelmed: '\u{1F635}',
  sad: '\u{1F614}',
  angry: '\u{1F620}',
};

const EMOTION_BACKGROUNDS: Record<CheckInEmotion, { light: string; dark: string }> = {
  happy: { light: '#FBE3A3', dark: '#5A4820' },
  content: { light: '#D8EFD9', dark: '#274534' },
  excited: { light: '#FFD3A8', dark: '#5A3421' },
  bliss: { light: '#F8C8DC', dark: '#573142' },
  anxious: { light: '#E6D4FF', dark: '#3F3156' },
  overwhelmed: { light: '#FFD9C9', dark: '#5B382C' },
  sad: { light: '#CFE3FF', dark: '#2A4160' },
  angry: { light: '#FFC6C1', dark: '#5E2B28' },
};

const EVENING_CHECK_IN_NOTIFICATION_ID = 'echo-evening-checkin';

function formatCheckInDate(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Saved check-in';

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatCheckInTimestamp(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Saved check-in';

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getPrimaryEmotion(checkInEmotions: Record<CheckInEmotion, boolean>): CheckInEmotion | null {
  return CHECK_IN_EMOTIONS.find((emotion) => checkInEmotions[emotion]) ?? null;
}

function energyIconName(energy: number): 'battery.25' | 'battery.50' | 'battery.75' | 'battery.100' {
  if (energy <= 1) return 'battery.25';
  if (energy === 2) return 'battery.50';
  if (energy <= 4) return 'battery.75';
  return 'battery.100';
}

function createEmptyEmotions(): Record<CheckInEmotion, boolean> {
  return CHECK_IN_EMOTIONS.reduce(
    (result, emotion) => ({ ...result, [emotion]: false }),
    {} as Record<CheckInEmotion, boolean>
  );
}

function createEmotionSelection(emotion: CheckInEmotion): Record<CheckInEmotion, boolean> {
  const next = createEmptyEmotions();
  next[emotion] = true;
  return next;
}

export default function CheckInScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const palette = Colors[colorScheme];
  const { checkIns, updateCheckIn } = useNotes();
  const recentCheckIns = useMemo(() => checkIns.slice(0, 8), [checkIns]);
  const [selectedCheckIn, setSelectedCheckIn] = useState<CheckIn | null>(null);
  const [draftEnergy, setDraftEnergy] = useState(1);
  const [draftEmotions, setDraftEmotions] = useState<Record<CheckInEmotion, boolean>>(createEmptyEmotions);
  const [draftBody, setDraftBody] = useState('');
  const [energyMenuOpen, setEnergyMenuOpen] = useState(false);
  const [emotionMenuOpen, setEmotionMenuOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const currentPermissions = await Notifications.getPermissionsAsync();
        const finalPermissions = canSendNotifications(currentPermissions)
          ? currentPermissions
          : await Notifications.requestPermissionsAsync();

        if (!isMounted || !canSendNotifications(finalPermissions)) return;

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

  function openCheckIn(checkIn: CheckIn) {
    setSelectedCheckIn(checkIn);
    setDraftEnergy(checkIn.energy);
    setDraftEmotions({ ...checkIn.emotions });
    setDraftBody(checkIn.body);
    setEnergyMenuOpen(false);
    setEmotionMenuOpen(false);
  }

  function closeCheckInModal() {
    setSelectedCheckIn(null);
    setEnergyMenuOpen(false);
    setEmotionMenuOpen(false);
  }

  function handleSelectEmotion(emotion: CheckInEmotion) {
    setDraftEmotions(createEmotionSelection(emotion));
  }

  function handleSaveCheckIn() {
    if (!selectedCheckIn || draftBody.trim().length === 0) return;

    updateCheckIn(selectedCheckIn.id, {
      energy: draftEnergy,
      emotions: draftEmotions,
      body: draftBody,
    });
    closeCheckInModal();
  }

  const selectedEmotion = getPrimaryEmotion(draftEmotions);

  return (
    <ThemedView style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.headerRow}>
          <ThemedText type="subtitle" style={{ fontSize: 18, flex: 1 }}>
            Recent Check-ins
          </ThemedText>
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
            const primaryEmotion = getPrimaryEmotion(checkIn.emotions);
            const emotionTone = primaryEmotion
              ? EMOTION_BACKGROUNDS[primaryEmotion][colorScheme]
              : palette.surfaceAlt;
            const energyIcon = energyIconName(checkIn.energy);

            return (
              <Pressable
                key={checkIn.id}
                accessibilityLabel={`Open check-in from ${formatCheckInDate(checkIn.createdAt)}`}
                onPress={() => openCheckIn(checkIn)}
                style={({ pressed }) => [
                  styles.historyCard,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                <View style={styles.historyRow}>
                  <View style={styles.historyLead}>
                    {primaryEmotion ? (
                      <View style={[styles.emotionChip, { backgroundColor: emotionTone }]}>
                        <ThemedText style={styles.emotionEmoji}>
                          {EMOTION_EMOJIS[primaryEmotion]}
                        </ThemedText>
                      </View>
                    ) : (
                      <View style={[styles.emotionChip, { backgroundColor: palette.surfaceAlt }]}>
                        <ThemedText style={styles.emotionEmoji}>•</ThemedText>
                      </View>
                    )}
                    <View
                      style={[
                        styles.energyChip,
                        { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
                      ]}>
                      <IconSymbol name={energyIcon} size={18} color={palette.accent} />
                    </View>
                    <View style={styles.historyTextWrap}>
                      <ThemedText
                        style={[styles.historyBody, { color: palette.text }]}
                        numberOfLines={1}>
                        {checkIn.body || (primaryEmotion ? EMOTION_LABELS[primaryEmotion] : 'Check-in')}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={[styles.historyMeta, { color: palette.muted }]}>
                    {formatCheckInDate(checkIn.createdAt)}
                  </ThemedText>
                </View>
              </Pressable>
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

      <Modal
        visible={selectedCheckIn !== null}
        transparent
        animationType="fade"
        onRequestClose={closeCheckInModal}>
        <Pressable onPress={closeCheckInModal} style={styles.modalOverlay}>
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              Keyboard.dismiss();
            }}
            style={[
              styles.modalCard,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}>
            <View
              style={[
                styles.modalContent,
                { paddingBottom: 14 },
              ]}
            >
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCopy}>
                    <ThemedText type="subtitle" style={styles.modalTitle}>
                      Check-in details
                    </ThemedText>
                    {selectedCheckIn ? (
                      <ThemedText style={{ color: palette.muted, fontSize: 13 }}>
                        {formatCheckInTimestamp(selectedCheckIn.createdAt)}
                      </ThemedText>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityLabel="Close check-in details"
                    onPress={closeCheckInModal}
                    style={({ pressed }) => [
                      styles.closeButton,
                      {
                        backgroundColor: palette.surfaceAlt,
                        borderColor: palette.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <IconSymbol name="xmark" size={16} color={palette.text} />
                  </Pressable>
                </View>

                <View style={[styles.section, energyMenuOpen && styles.dropdownSectionOpen]}>
                  <View style={styles.dropdownWrap}>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        Keyboard.dismiss();
                        setEnergyMenuOpen((open) => !open);
                        setEmotionMenuOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.dropdownTrigger,
                        {
                          backgroundColor: palette.surfaceAlt,
                          borderColor: palette.border,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}>
                      <View style={styles.dropdownTriggerLead}>
                        <IconSymbol name={energyIconName(draftEnergy)} size={18} color={palette.accent} />
                        <ThemedText style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>
                          {`${draftEnergy} / 5`}
                        </ThemedText>
                      </View>
                      <IconSymbol
                        name={energyMenuOpen ? 'chevron.up' : 'chevron.down'}
                        size={16}
                        color={palette.muted}
                      />
                    </Pressable>

                    {energyMenuOpen ? (
                      <Pressable
                        onPress={(event) => event.stopPropagation()}
                        style={[
                          styles.dropdownMenu,
                          { backgroundColor: palette.surface, borderColor: palette.border },
                        ]}>
                        {[1, 2, 3, 4, 5].map((value) => {
                          const selected = draftEnergy === value;
                          return (
                            <Pressable
                              key={value}
                              onPress={(event) => {
                                event.stopPropagation();
                                setDraftEnergy(value);
                                setEnergyMenuOpen(false);
                              }}
                              style={({ pressed }) => [
                                styles.dropdownOption,
                                {
                                  backgroundColor: selected ? palette.surfaceAlt : 'transparent',
                                  opacity: pressed ? 0.8 : 1,
                                },
                              ]}>
                              <View style={styles.dropdownTriggerLead}>
                                <IconSymbol
                                  name={energyIconName(value)}
                                  size={18}
                                  color={selected ? palette.accent : palette.muted}
                                />
                                <ThemedText style={{ color: palette.text, fontSize: 15 }}>
                                  {`${value} / 5`}
                                </ThemedText>
                              </View>
                            </Pressable>
                          );
                        })}
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View style={[styles.section, emotionMenuOpen && styles.dropdownSectionOpen]}>
                  <View style={styles.dropdownWrap}>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        Keyboard.dismiss();
                        setEmotionMenuOpen((open) => !open);
                        setEnergyMenuOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.dropdownTrigger,
                        {
                          backgroundColor: selectedEmotion
                            ? EMOTION_BACKGROUNDS[selectedEmotion][colorScheme]
                            : palette.surfaceAlt,
                          borderColor: palette.border,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}>
                      <View style={styles.dropdownTriggerLead}>
                        <ThemedText style={styles.dropdownEmoji}>
                          {selectedEmotion ? EMOTION_EMOJIS[selectedEmotion] : '•'}
                        </ThemedText>
                        <ThemedText style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>
                          {selectedEmotion ? EMOTION_LABELS[selectedEmotion] : 'Choose emotion'}
                        </ThemedText>
                      </View>
                      <IconSymbol
                        name={emotionMenuOpen ? 'chevron.up' : 'chevron.down'}
                        size={16}
                        color={palette.muted}
                      />
                    </Pressable>

                    {emotionMenuOpen ? (
                      <Pressable
                        onPress={(event) => event.stopPropagation()}
                        style={[
                          styles.dropdownMenu,
                          { backgroundColor: palette.surface, borderColor: palette.border },
                        ]}>
                        {CHECK_IN_EMOTIONS.map((emotion) => {
                          const selected = draftEmotions[emotion];
                          return (
                            <Pressable
                              key={emotion}
                              onPress={(event) => {
                                event.stopPropagation();
                                handleSelectEmotion(emotion);
                                setEmotionMenuOpen(false);
                              }}
                              style={({ pressed }) => [
                                styles.dropdownOption,
                                {
                                  backgroundColor: EMOTION_BACKGROUNDS[emotion][colorScheme],
                                  opacity: pressed ? 0.8 : 1,
                                },
                              ]}>
                              <View style={styles.dropdownTriggerLead}>
                                <ThemedText style={styles.dropdownEmoji}>
                                  {EMOTION_EMOJIS[emotion]}
                                </ThemedText>
                                <ThemedText
                                  style={{
                                    color: selected ? palette.accent : palette.text,
                                    fontSize: 15,
                                    fontWeight: selected ? '700' : '500',
                                  }}>
                                  {EMOTION_LABELS[emotion]}
                                </ThemedText>
                              </View>
                            </Pressable>
                          );
                        })}
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View style={styles.section}>
                  <TextInput
                    multiline
                    scrollEnabled
                    placeholder="Write a few sentences about the day."
                    placeholderTextColor={palette.muted}
                    value={draftBody}
                    onChangeText={setDraftBody}
                    onPressIn={(event) => event.stopPropagation()}
                    textAlignVertical="top"
                    style={[
                      styles.textArea,
                      {
                        color: palette.text,
                        borderColor: palette.border,
                        backgroundColor: palette.surfaceAlt,
                        fontFamily: Fonts.sans,
                      },
                    ]}
                  />
                </View>

                <View style={styles.modalActions}>
                  <Pressable
                    onPress={closeCheckInModal}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      {
                        backgroundColor: palette.surfaceAlt,
                        borderColor: palette.border,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}>
                    <ThemedText style={{ color: palette.text, fontWeight: '600' }}>
                      Cancel
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    disabled={draftBody.trim().length === 0}
                    onPress={handleSaveCheckIn}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      {
                        backgroundColor: palette.accent,
                        opacity: pressed || draftBody.trim().length === 0 ? 0.65 : 1,
                      },
                    ]}>
                    <ThemedText style={{ color: palette.background, fontWeight: '700' }}>
                      Save changes
                    </ThemedText>
                  </Pressable>
                </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
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
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    gap: 6,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  historyLead: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyMeta: {
    fontSize: 12,
    lineHeight: 16,
  },
  emotionChip: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emotionEmoji: {
    fontSize: 15,
    lineHeight: 18,
  },
  energyChip: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  historyBody: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 16, 28, 0.42)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 24,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  modalContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  modalTitle: {
    fontSize: 22,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: 10,
    position: 'relative',
    zIndex: 1,
  },
  dropdownSectionOpen: {
    zIndex: 100,
    elevation: 100,
  },
  dropdownWrap: {
    position: 'relative',
    zIndex: 10,
    elevation: 10,
  },
  dropdownTrigger: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dropdownTriggerLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropdownEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 54,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 18,
    padding: 8,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    zIndex: 1000,
    elevation: 1000,
  },
  dropdownOption: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  textArea: {
    height: 330,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
});
