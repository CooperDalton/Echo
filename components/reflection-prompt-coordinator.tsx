import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useNotes } from '@/context/notes-context';
import { scheduleWeeklyReviewReminder } from '@/lib/notifications/reflection-reminders';
import {
  getReflectionPrompt,
} from '@/lib/weekly-reviews/schedule';

export function ReflectionPromptCoordinator() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    hydrated,
    checkIns,
    weeklyReviews,
    weeklyReviewPreferences,
  } = useNotes();
  const [activation, setActivation] = useState(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const handledActivationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    void scheduleWeeklyReviewReminder(weeklyReviewPreferences, false);
  }, [hydrated, weeklyReviewPreferences]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasInactive = appStateRef.current !== 'active';
      appStateRef.current = nextState;
      if (nextState === 'active' && wasInactive) {
        handledActivationRef.current = null;
        setActivation((current) => current + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  const evaluate = useCallback(() => {
    if (!hydrated || AppState.currentState !== 'active') return;
    if (handledActivationRef.current === activation) return;
    if (pathname === '/weekly-review' || pathname === '/checkin-flow') return;

    const prompt = getReflectionPrompt(
      weeklyReviewPreferences,
      weeklyReviews,
      checkIns
    );
    handledActivationRef.current = activation;

    if (prompt?.kind === 'weekly-review') {
      router.push({
        pathname: '/weekly-review',
        params: { scheduledFor: prompt.scheduledFor, source: 'prompt' },
      });
      return;
    }

    if (prompt?.kind === 'evening-check-in') {
      router.push({ pathname: '/checkin-flow', params: { source: 'prompt' } });
    }
  }, [activation, checkIns, hydrated, pathname, router, weeklyReviewPreferences, weeklyReviews]);

  useEffect(() => {
    const timer = setTimeout(evaluate, 250);
    return () => clearTimeout(timer);
  }, [evaluate]);

  return null;
}
