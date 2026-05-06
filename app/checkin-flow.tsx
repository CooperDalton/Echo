import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
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

type CheckInStep = 'energy' | 'emotions' | 'write';

const STEPS: CheckInStep[] = ['energy', 'emotions', 'write'];
const ENERGY_MIN = 1;
const ENERGY_MAX = 5;
const SLIDER_THUMB_SIZE = 28;

function renderBatteryDisplay(value: number, activeColor: string, inactiveColor: string) {
  return (
    <View style={styles.heroBatteryWrap}>
      <View style={[styles.heroBatteryBody, { borderColor: activeColor }]}>
        {[1, 2, 3, 4, 5].map((bar) => (
          <View
            key={bar}
            style={[
              styles.heroBatteryBar,
              { backgroundColor: bar <= value ? activeColor : inactiveColor },
            ]}
          />
        ))}
      </View>
      <View style={[styles.heroBatteryCap, { backgroundColor: activeColor }]} />
    </View>
  );
}

function createEmptyEmotions(): Record<CheckInEmotion, boolean> {
  return CHECK_IN_EMOTIONS.reduce(
    (result, emotion) => ({ ...result, [emotion]: false }),
    {} as Record<CheckInEmotion, boolean>
  );
}

export default function CheckInFlowScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const palette = Colors[colorScheme];
  const energySliderRef = useRef<View>(null);
  const { addCheckIn } = useNotes();
  const [stepIndex, setStepIndex] = useState(0);
  const [energy, setEnergy] = useState(1);
  const [energySliderWidth, setEnergySliderWidth] = useState(0);
  const [energySliderPageX, setEnergySliderPageX] = useState(0);
  const [emotions, setEmotions] = useState(createEmptyEmotions);
  const [body, setBody] = useState('');

  const step = STEPS[stepIndex];
  const canSave = body.trim().length > 0;
  const progressLabel = `${stepIndex + 1}/${STEPS.length}`;

  function goBack() {
    if (stepIndex === 0) {
      router.back();
      return;
    }
    setStepIndex((current) => current - 1);
  }

  function goNext() {
    if (stepIndex >= STEPS.length - 1) return;
    setStepIndex((current) => current + 1);
  }

  async function handleEnergyChange(value: number) {
    if (value === energy) return;
    await Haptics.selectionAsync();
    setEnergy(value);
  }

  function handleEnergySliderLayout(event: LayoutChangeEvent) {
    setEnergySliderWidth(event.nativeEvent.layout.width);
    energySliderRef.current?.measureInWindow((x) => {
      setEnergySliderPageX(x);
    });
  }

  function updateEnergyFromSlider(pageX: number) {
    if (energySliderWidth <= 0) return;

    const positionX = pageX - energySliderPageX;
    const clampedX = Math.max(0, Math.min(positionX, energySliderWidth));
    const ratio = clampedX / energySliderWidth;
    const nextEnergy = Math.round(ratio * (ENERGY_MAX - ENERGY_MIN)) + ENERGY_MIN;
    void handleEnergyChange(nextEnergy);
  }

  function finishEnergySelection() {
    goNext();
  }

  function saveCheckIn() {
    if (!canSave) return;

    addCheckIn({
      kind: 'evening',
      energy,
      emotions,
      body,
    });
    router.replace('/(tabs)/checkin');
  }

  return (
    <ThemedView style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityLabel={stepIndex === 0 ? 'Close check-in' : 'Previous step'}
              hitSlop={8}
              onPress={goBack}
              style={({ pressed }) => [
                styles.iconButton,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surfaceAlt,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <IconSymbol name="chevron.left" size={22} color={palette.text} />
            </Pressable>
            <ThemedText style={{ color: palette.muted, fontSize: 14 }}>{progressLabel}</ThemedText>
          </View>

          <View style={styles.stepContent}>
            {step === 'energy' ? (
              <>
                <View style={[styles.heroCopy, styles.energyHeroCopy]}>
                  <ThemedText type="subtitle" style={styles.stepTitle}>
                    Energy
                  </ThemedText>
                </View>
                <View style={styles.energyStage}>
                  <View style={styles.energyDisplayCard}>
                    {renderBatteryDisplay(energy, palette.accent, palette.border)}
                  </View>
                </View>
                <View style={styles.energySliderCard}>
                  <View
                    ref={energySliderRef}
                    accessible
                    accessibilityLabel={`Energy slider. Current energy ${energy} out of 5`}
                    accessibilityRole="adjustable"
                    accessibilityValue={{ min: ENERGY_MIN, max: ENERGY_MAX, now: energy }}
                    onAccessibilityAction={(event) => {
                      if (event.nativeEvent.actionName === 'increment' && energy < ENERGY_MAX) {
                        void handleEnergyChange(energy + 1);
                      }
                      if (event.nativeEvent.actionName === 'decrement' && energy > ENERGY_MIN) {
                        void handleEnergyChange(energy - 1);
                      }
                    }}
                    accessibilityActions={[
                      { name: 'increment', label: 'Increase energy' },
                      { name: 'decrement', label: 'Decrease energy' },
                    ]}
                    onLayout={handleEnergySliderLayout}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={(event) => {
                      updateEnergyFromSlider(event.nativeEvent.pageX);
                    }}
                    onResponderMove={(event) => {
                      updateEnergyFromSlider(event.nativeEvent.pageX);
                    }}
                    onResponderRelease={finishEnergySelection}
                    onResponderTerminate={finishEnergySelection}
                    style={styles.energySliderInteractive}>
                    <View
                      pointerEvents="none"
                      style={[styles.energySliderTrackBase, { backgroundColor: palette.border }]}
                    />
                    <View
                      pointerEvents="none"
                      style={[
                        styles.energySliderTrackFill,
                        {
                          backgroundColor: palette.accent,
                          width: energySliderWidth
                            ? Math.max(
                                10,
                                (energySliderWidth * (energy - ENERGY_MIN)) /
                                  (ENERGY_MAX - ENERGY_MIN)
                              )
                            : 10,
                        },
                      ]}
                    />
                    <View
                      pointerEvents="none"
                      style={[
                        styles.energyThumb,
                        {
                          backgroundColor: palette.accent,
                          borderColor: palette.surface,
                          left: energySliderWidth
                            ? (energySliderWidth * (energy - ENERGY_MIN)) /
                                (ENERGY_MAX - ENERGY_MIN) -
                              SLIDER_THUMB_SIZE / 2
                            : -SLIDER_THUMB_SIZE / 2,
                        },
                      ]}
                    />
                  </View>
                </View>
              </>
            ) : null}

            {step === 'emotions' ? (
              <>
                <View style={[styles.heroCopy, styles.emotionsHeroCopy]}>
                  <ThemedText type="subtitle" style={styles.stepTitle}>
                    Emotions
                  </ThemedText>
                </View>
                <View style={styles.emotionGrid}>
                  {CHECK_IN_EMOTIONS.map((emotion) => {
                    const selected = emotions[emotion];
                    return (
                      <Pressable
                        key={emotion}
                        onPress={() => {
                          const next = createEmptyEmotions();
                          next[emotion] = true;
                          setEmotions(next);
                          goNext();
                        }}
                        style={({ pressed }) => [
                          styles.emotionChip,
                          {
                            backgroundColor: EMOTION_BACKGROUNDS[emotion][colorScheme],
                            borderColor: selected ? palette.accent : palette.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}>
                        <ThemedText
                          style={{
                            fontSize: 24,
                            lineHeight: 30,
                          }}>
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
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {step === 'write' ? (
              <>
                <View style={styles.heroCopy}>
                  <ThemedText type="subtitle" style={styles.stepTitle}>
                    What did you do today?
                  </ThemedText>
                </View>
                <TextInput
                  autoFocus
                  multiline
                  placeholder="Write a few sentences about the day."
                  placeholderTextColor={palette.muted}
                  value={body}
                  onChangeText={setBody}
                  textAlignVertical="top"
                  style={[
                    styles.textArea,
                    {
                      color: palette.text,
                      fontFamily: Fonts.sans,
                    },
                  ]}
                />
              </>
            ) : null}
          </View>

          <View style={styles.bottomBar}>
            {step === 'write' ? (
              <Pressable
                disabled={!canSave}
                onPress={saveCheckIn}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: palette.accent,
                    opacity: pressed || !canSave ? 0.65 : 1,
                  },
                ]}>
                <ThemedText style={{ color: palette.background, fontSize: 15, fontWeight: '600' }}>
                  Save check-in
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepContent: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: 24,
  },
  heroCopy: {
    gap: 8,
  },
  energyHeroCopy: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  emotionsHeroCopy: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  stepTitle: {
    fontSize: 30,
  },
  energyStage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  energyDisplayCard: {
    width: '100%',
    maxWidth: 360,
    paddingHorizontal: 24,
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBatteryWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroBatteryBody: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 5,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  heroBatteryBar: {
    width: 28,
    height: 96,
    borderRadius: 999,
  },
  heroBatteryCap: {
    width: 16,
    height: 56,
    borderRadius: 999,
    marginLeft: 10,
  },
  energySliderCard: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  energySliderInteractive: {
    height: 44,
    justifyContent: 'center',
  },
  energySliderTrackBase: {
    height: 8,
    borderRadius: 999,
  },
  energySliderTrackFill: {
    position: 'absolute',
    left: 0,
    height: 8,
    borderRadius: 999,
  },
  energyThumb: {
    position: 'absolute',
    top: '50%',
    width: SLIDER_THUMB_SIZE,
    height: SLIDER_THUMB_SIZE,
    borderRadius: 999,
    borderWidth: 4,
    marginTop: -(SLIDER_THUMB_SIZE / 2),
  },
  emotionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  emotionChip: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
  },
  textArea: {
    flex: 1,
    minHeight: 0,
    paddingTop: 4,
    paddingHorizontal: 0,
    paddingBottom: 16,
    fontSize: 16,
    lineHeight: 24,
  },
  bottomBar: {
    minHeight: 60,
    paddingBottom: 8,
    justifyContent: 'flex-end',
  },
  primaryButton: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
  },
});
