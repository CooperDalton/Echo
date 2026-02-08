import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BUCKET_COLORS, BUCKETS, type BucketName } from '@/constants/buckets';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const todayEchoes: { text: string; bucket: BucketName; date: string }[] = [
  {
    text: 'Keep Echo ambient. No streaks, no nags.',
    bucket: 'Systems',
    date: 'Echo from March 12',
  },
  {
    text: 'Surface long notes with a single sentence that preserves meaning.',
    bucket: 'Reflections',
    date: 'Echo from March 10',
  },
];

const bucketSummary: { name: BucketName; count: number }[] = [
  { name: 'Business Ideas', count: 24 },
  { name: 'Reflections', count: 58 },
  { name: 'Game Dev', count: 12 },
  { name: 'Family', count: 9 },
  { name: 'Systems', count: 31 },
];

const schedule = [
  { label: '+1 day', range: 'Tomorrow', detail: 'Quick reinforce' },
  { label: '+4-9 days', range: 'Next week', detail: 'Randomized window' },
  { label: '+12-18 days', range: 'Mid month', detail: 'Soft recall' },
  { label: '+30-45 days', range: 'Next month', detail: 'Long memory' },
  { label: '+60-90 days', range: 'Quarter', detail: 'Deep reinforcement' },
  { label: '+120-180 days', range: 'Half year', detail: 'Last resurfacing' },
];

const standingMessages = ['Slow down, capture clearly.', 'Keep the buckets semantic.'];

function bucketTone(bucket: BucketName, colorScheme: 'light' | 'dark') {
  const color = BUCKET_COLORS[bucket];
  return colorScheme === 'dark'
    ? { bg: color.darkBg, border: color.darkBorder, text: color.darkText }
    : { bg: color.lightBg, border: color.lightBorder, text: color.lightText };
}

export default function EchoScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const palette = Colors[colorScheme];
  const [bucketOpen, setBucketOpen] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<BucketName>(BUCKETS[0]);

  return (
    <ThemedView style={[styles.screen, { paddingTop: insets.top }]}> 
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}> 
        <View style={styles.header}>
          <ThemedText type="title" style={{ fontSize: 30, letterSpacing: -0.6 }}>
            Echo
          </ThemedText>
          <ThemedText style={{ color: palette.muted, marginTop: 6 }}>
            Spaced recall without the pressure.
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ fontSize: 18 }}>
            Bucket
          </ThemedText>
          <View style={styles.bucketWrap}>
            <Pressable
              style={({ pressed }) => [
                styles.bucketTrigger,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surfaceAlt,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              onPress={() => setBucketOpen((open) => !open)}>
              <View
                style={[
                  styles.bucketDot,
                  { backgroundColor: bucketTone(selectedBucket, colorScheme).text },
                ]}
              />
              <ThemedText style={{ color: palette.text, fontSize: 14 }}>{selectedBucket}</ThemedText>
              <ThemedText style={{ color: palette.muted, fontSize: 12 }}>v</ThemedText>
            </Pressable>
            {bucketOpen ? (
              <View
                style={[
                  styles.bucketMenu,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}>
                {BUCKETS.map((bucket) => {
                  const tone = bucketTone(bucket, colorScheme);
                  return (
                    <Pressable
                      key={bucket}
                      style={({ pressed }) => [styles.bucketOption, { opacity: pressed ? 0.7 : 1 }]}
                      onPress={() => {
                        setSelectedBucket(bucket);
                        setBucketOpen(false);
                      }}>
                      <View style={[styles.bucketPill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                        <ThemedText style={{ color: tone.text, fontSize: 12 }}>{bucket}</ThemedText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View style={styles.bucketGrid}>
            {bucketSummary.map((bucket) => {
              const tone = bucketTone(bucket.name, colorScheme);
              return (
                <View
                  key={bucket.name}
                  style={[
                    styles.bucketCard,
                    { backgroundColor: tone.bg, borderColor: tone.border },
                  ]}>
                  <ThemedText style={{ fontSize: 15, color: tone.text }}>{bucket.name}</ThemedText>
                  <ThemedText style={{ color: tone.text, marginTop: 6, fontSize: 13 }}>
                    {bucket.count} notes
                  </ThemedText>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ fontSize: 18 }}>
            Today
          </ThemedText>
          <View style={styles.echoStack}>
            {todayEchoes.map((echo, index) => {
              const tone = bucketTone(echo.bucket, colorScheme);
              return (
                <View
                  key={`${echo.text}-${index}`}
                  style={[
                    styles.echoCard,
                    { backgroundColor: palette.surface, borderColor: palette.border },
                  ]}>
                  <View style={styles.noteHeaderRow}>
                    <ThemedText style={styles.noteTitle} numberOfLines={1}>
                      {echo.text}
                    </ThemedText>
                    <View
                      style={[
                        styles.bucketPill,
                        styles.noteBucketPill,
                        { backgroundColor: tone.bg, borderColor: tone.border },
                      ]}>
                      <ThemedText style={{ fontSize: 10, lineHeight: 12, color: tone.text }}>
                        {echo.bucket}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={{ color: palette.muted, marginTop: 8, fontSize: 12 }}>
                    {echo.date}
                  </ThemedText>
                </View>
              );
            })}
            <View
              style={[
                styles.echoCard,
                styles.emptyEcho,
                { borderColor: palette.border, backgroundColor: palette.surfaceAlt },
              ]}>
              <ThemedText style={{ color: palette.muted }}>
                No more echoes today. Max 3 per day.
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ fontSize: 18 }}>
            Widget Preview
          </ThemedText>
          <View
            style={[
              styles.widgetCard,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}>
            {todayEchoes.map((echo, index) => {
              const tone = bucketTone(echo.bucket, colorScheme);
              return (
                <View key={`${echo.text}-preview`} style={styles.previewRow}>
                  <ThemedText style={{ fontSize: 13, color: palette.text, flex: 1 }}>
                    {index + 1}. {echo.text}
                  </ThemedText>
                  <View style={[styles.bucketPill, { backgroundColor: tone.bg, borderColor: tone.border }]}> 
                    <ThemedText style={{ fontSize: 11, color: tone.text }}>{echo.bucket}</ThemedText>
                  </View>
                </View>
              );
            })}
            <ThemedText style={{ fontSize: 13, color: palette.muted }}>
              {todayEchoes.length === 0 ? 'Calm state' : 'Tap to open the full note'}
            </ThemedText>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ fontSize: 18 }}>
            Standing Messages
          </ThemedText>
          <View style={styles.standingRow}>
            {standingMessages.map((message) => (
              <View
                key={message}
                style={[
                  styles.standingCard,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}>
                <ThemedText style={{ fontSize: 14 }}>{message}</ThemedText>
              </View>
            ))}
            <View
              style={[
                styles.standingCard,
                styles.addStanding,
                { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
              ]}>
              <ThemedText style={{ fontSize: 14, color: palette.muted }}>+ Add message</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ fontSize: 18 }}>
            Schedule Rules
          </ThemedText>
          <View style={styles.scheduleList}>
            {schedule.map((item) => (
              <View
                key={item.label}
                style={[
                  styles.scheduleRow,
                  { borderColor: palette.border, backgroundColor: palette.surface },
                ]}>
                <View>
                  <ThemedText style={{ fontSize: 14 }}>{item.label}</ThemedText>
                  <ThemedText style={{ color: palette.muted, fontSize: 12, marginTop: 4 }}>
                    {item.range}
                  </ThemedText>
                </View>
                <ThemedText style={{ color: palette.muted, fontSize: 12 }}>
                  {item.detail}
                </ThemedText>
              </View>
            ))}
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
  echoStack: {
    gap: 12,
  },
  echoCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  emptyEcho: {
    borderStyle: 'dashed',
  },
  widgetCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    gap: 8,
    minHeight: 140,
    justifyContent: 'space-between',
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
});
