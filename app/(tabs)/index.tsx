import { useMemo, useState, useEffect, useCallback } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useNotes } from '@/context/notes-context';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function CaptureScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const palette = Colors[colorScheme];
  const { addRecentNote } = useNotes();
  const destructiveOutlineColor = colorScheme === 'dark' ? '#FF8E8E' : '#A82424';
  const destructiveFillColor = colorScheme === 'dark' ? '#C96F6F' : '#F2B6B6';
  const destructiveButtonBg = colorScheme === 'dark' ? '#3A2424' : '#FDE8E8';
  const { text: initialTextParam, noEcho, returnTo, standingMode, standingId, noteId } = useLocalSearchParams<{
    text?: string;
    noEcho?: string;
    returnTo?: string;
    standingMode?: string;
    standingId?: string;
    noteId?: string;
  }>();
  const [text, setText] = useState(
    typeof initialTextParam === 'string' ? initialTextParam : ''
  );

  useEffect(() => {
    if (typeof initialTextParam === 'string') {
      setText(initialTextParam);
    }
  }, [initialTextParam]);

  // Clear editor whenever Capture loses focus so returning to the tab starts fresh
  useFocusEffect(
    useCallback(() => {
      return () => {
        setText('');
      };
    }, [])
  );

  const placeholderColor = useMemo(
    () => (colorScheme === 'dark' ? '#9C9489' : '#8B837A'),
    [colorScheme]
  );

  const inStandingMode = standingMode === '1';
  const hasExistingNoteId = typeof noteId === 'string' && noteId.length > 0;
  const parsedStandingId = typeof standingId === 'string' ? Number.parseInt(standingId, 10) : NaN;
  const hasStandingId = Number.isInteger(parsedStandingId) && parsedStandingId >= 0;
  const returnPath =
    returnTo === '/echo' || returnTo === '/explore'
      ? returnTo
      : '/explore';

  // Hide Echo for standing message capture/edit mode.
  const editingStanding = useMemo(() => {
    if (inStandingMode) return true;
    return noEcho === '1' && typeof initialTextParam === 'string' && text === initialTextParam;
  }, [inStandingMode, noEcho, initialTextParam, text]);

  const goBack = useCallback(() => {
    router.replace(returnPath);
  }, [returnPath, router]);
  const submitEnabled = text.trim().length > 0;
  const saveDisabled = !editingStanding && !submitEnabled;

  const saveStandingMessage = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      goBack();
      return;
    }

    const params: Record<string, string> = {
      standingAction: 'upsert',
      standingText: trimmed,
      standingNonce: `${Date.now()}`,
    };
    if (hasStandingId) {
      params.standingId = `${parsedStandingId}`;
    }
    if (returnPath === '/echo') {
      router.replace({ pathname: '/echo', params });
      return;
    }
    router.replace(returnPath);
  }, [goBack, hasStandingId, parsedStandingId, returnPath, router, text]);

  const deleteStandingMessage = useCallback(() => {
    if (!hasStandingId) {
      goBack();
      return;
    }

    if (returnPath === '/echo') {
      router.replace({
        pathname: '/echo',
        params: {
          standingAction: 'delete',
          standingId: `${parsedStandingId}`,
          standingNonce: `${Date.now()}`,
        },
      });
      return;
    }
    router.replace(returnPath);
  }, [goBack, hasStandingId, parsedStandingId, returnPath, router]);

  const submitNote = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      goBack();
      return;
    }

    // Existing note opens are currently read-only in Capture.
    if (!hasExistingNoteId) {
      addRecentNote(trimmed);
    }

    goBack();
  }, [addRecentNote, goBack, hasExistingNoteId, text]);

  // Ensure tapping the Capture tab always starts a fresh note (no params)
  useEffect(() => {
    const unsub = (navigation as { addListener: (event: 'tabPress', callback: () => void) => () => void }).addListener('tabPress', () => {
      setText('');
      router.replace('/');
    });
    return unsub;
  }, [navigation, router]);

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
            onPress={() => {
              goBack();
            }}
          >
            <IconSymbol name="chevron.left" size={20} color={palette.text} />
          </Pressable>
          <View style={styles.actionsTop}>
            {!editingStanding ? (
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: palette.accent, opacity: pressed || !submitEnabled ? 0.7 : 1 },
                ]}
                disabled={!submitEnabled}
                onPress={submitNote}>
                <ThemedText style={{ color: palette.background, fontSize: 14 }}>Echo</ThemedText>
              </Pressable>
            ) : null}
            {editingStanding ? (
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: destructiveOutlineColor, backgroundColor: destructiveButtonBg, opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityLabel="Delete standing message"
                onPress={deleteStandingMessage}
              >
                <View style={styles.trashIconWrap}>
                  <IconSymbol name="trash.fill" size={18} color={destructiveFillColor} style={styles.trashIconLayer} />
                  <IconSymbol name="trash" size={18} color={destructiveOutlineColor} style={styles.trashIconLayer} />
                </View>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surfaceAlt,
                  opacity: pressed || saveDisabled ? 0.7 : 1,
                },
              ]}
              accessibilityLabel="Save note"
              disabled={saveDisabled}
              onPress={() => {
                if (editingStanding) {
                  saveStandingMessage();
                  return;
                }
                submitNote();
              }}>
              <IconSymbol name="checkmark" size={18} color={palette.text} />
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
          value={text}
          onChangeText={setText}
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
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    borderRadius: 999,
    height: 36,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashIconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashIconLayer: {
    position: 'absolute',
  },
});
