import { useMemo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function CaptureScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const palette = Colors[colorScheme];

  const placeholderColor = useMemo(
    () => (colorScheme === 'dark' ? '#9C9489' : '#8B837A'),
    [colorScheme]
  );

  return (
    <ThemedView style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.topBar}>
          <View style={styles.actionsTop}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: palette.accent, opacity: pressed ? 0.7 : 1 },
              ]}>
              <ThemedText style={{ color: palette.background, fontSize: 14 }}>Echo</ThemedText>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surfaceAlt,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              onPress={() => router.push('/echo')}>
              <ThemedText style={{ color: palette.text, fontSize: 14 }}>Submit</ThemedText>
            </Pressable>
          </View>
        </View>

        <TextInput
          autoFocus
          multiline
          placeholder="What do you want to remember later?"
          placeholderTextColor={placeholderColor}
          style={[
            styles.input,
            {
              color: palette.text,
              fontFamily: Fonts.sans,
            },
          ]}
          textAlignVertical="top"
        />
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
    gap: 16,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  input: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    fontSize: 16,
    lineHeight: 22,
  },
  actionsTop: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
});
