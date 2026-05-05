import { useState } from 'react';
import {
  KeyboardAvoidingView,
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

type CheckInStep = 'energy' | 'emotions' | 'write';

const STEPS: CheckInStep[] = ['energy', 'emotions', 'write'];

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
  const { addCheckIn } = useNotes();
  const [stepIndex, setStepIndex] = useState(0);
  const [energy, setEnergy] = useState(3);
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
                <View style={styles.heroCopy}>
                  <ThemedText type="subtitle" style={styles.stepTitle}>
                    Energy
                  </ThemedText>
                  <ThemedText style={[styles.stepDescription, { color: palette.muted }]}>
                    How much energy do you have right now?
                  </ThemedText>
                </View>
                <View style={styles.energyGrid}>
                  {[1, 2, 3, 4, 5].map((value) => {
                    const selected = value === energy;
                    return (
                      <Pressable
                        key={value}
                        accessibilityLabel={`Energy ${value}`}
                        onPress={() => {
                          setEnergy(value);
                          goNext();
                        }}
                        style={({ pressed }) => [
                          styles.energyButton,
                          {
                            backgroundColor: selected ? palette.accent : palette.surface,
                            borderColor: selected ? palette.accent : palette.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}>
                        <ThemedText
                          style={{
                            color: selected ? palette.background : palette.text,
                            fontSize: 28,
                            fontWeight: '700',
                          }}>
                          {value}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {step === 'emotions' ? (
              <>
                <View style={styles.heroCopy}>
                  <ThemedText type="subtitle" style={styles.stepTitle}>
                    Emotions
                  </ThemedText>
                  <ThemedText style={[styles.stepDescription, { color: palette.muted }]}>
                    Pick anything that fits. You can choose more than one.
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
                            backgroundColor: selected
                              ? Colors[colorScheme].accentSoft
                              : palette.surface,
                            borderColor: selected ? palette.accent : palette.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}>
                        <ThemedText
                          style={{
                            color: selected ? palette.accent : palette.text,
                            fontSize: 16,
                            fontWeight: selected ? '600' : '400',
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
                  <ThemedText style={[styles.stepDescription, { color: palette.muted }]}>
                    Write as much or as little as you want.
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
    justifyContent: 'center',
    gap: 24,
  },
  heroCopy: {
    gap: 8,
  },
  stepTitle: {
    fontSize: 30,
  },
  stepDescription: {
    fontSize: 16,
    lineHeight: 24,
  },
  energyGrid: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  energyButton: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emotionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  emotionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
