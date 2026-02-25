import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function NoteScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const palette = Colors[colorScheme];

  const params = useLocalSearchParams<{ title?: string; body?: string; bucket?: string }>();
  const [title, setTitle] = useState(params.title ?? '');
  const [body, setBody] = useState(params.body ?? '');

  const placeholderColor = useMemo(
    () => (colorScheme === 'dark' ? '#9C9489' : '#8B837A'),
    [colorScheme]
  );

  return (
    <ThemedView style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityLabel="Back to Library"
            hitSlop={8}
            style={({ pressed }) => [
              styles.backButton,
              {
                borderColor: palette.border,
                backgroundColor: palette.surfaceAlt,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={() => router.back()}
          >
            <IconSymbol name="chevron.left" size={20} color={palette.text} />
          </Pressable>
          <View style={styles.actionsTop}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: palette.accent, opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityLabel="Echo this note"
              onPress={() => router.push('/echo')}>
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
              accessibilityLabel="Save note"
              onPress={() => router.back()}>
              <IconSymbol name="checkmark" size={18} color={palette.text} />
            </Pressable>
          </View>
        </View>

        <TextInput
          placeholder="Title"
          value={title}
          onChangeText={setTitle}
          placeholderTextColor={placeholderColor}
          style={[styles.titleInput, { color: palette.text }]}
        />
        <TextInput
          multiline
          placeholder="Write your note"
          value={body}
          onChangeText={setBody}
          placeholderTextColor={placeholderColor}
          style={[
            styles.bodyInput,
            {
              color: palette.text,
              fontFamily: Fonts.sans,
              backgroundColor: palette.surfaceAlt,
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
    justifyContent: 'space-between',
    alignItems: 'center',
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
  backButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleInput: {
    fontSize: 18,
    fontWeight: '600',
  },
  bodyInput: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    fontSize: 16,
    lineHeight: 22,
  },
});

