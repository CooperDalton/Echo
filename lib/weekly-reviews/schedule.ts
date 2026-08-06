import type {
  CheckIn,
  WeeklyReview,
  WeeklyReviewPreferences,
} from '@/lib/notes/types';

export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function isValidWeeklyReviewSchedule(
  preferences: WeeklyReviewPreferences
): boolean {
  return (
    Number.isInteger(preferences.weekday) &&
    preferences.weekday >= 1 &&
    preferences.weekday <= 7 &&
    Number.isInteger(preferences.hour) &&
    preferences.hour >= 0 &&
    preferences.hour <= 23 &&
    Number.isInteger(preferences.minute) &&
    preferences.minute >= 0 &&
    preferences.minute <= 59
  );
}

export function getLatestWeeklyReviewOccurrence(
  preferences: WeeklyReviewPreferences,
  now = new Date()
): Date | null {
  if (!preferences.enabled || !preferences.startsAt || !isValidWeeklyReviewSchedule(preferences)) {
    return null;
  }

  const startsAt = new Date(preferences.startsAt);
  if (Number.isNaN(startsAt.getTime()) || now.getTime() < startsAt.getTime()) return null;

  const targetDay = preferences.weekday - 1;
  const occurrence = new Date(now);
  occurrence.setSeconds(0, 0);
  occurrence.setHours(preferences.hour, preferences.minute, 0, 0);
  occurrence.setDate(occurrence.getDate() - ((occurrence.getDay() - targetDay + 7) % 7));

  if (occurrence.getTime() > now.getTime()) {
    occurrence.setDate(occurrence.getDate() - 7);
  }

  return occurrence.getTime() >= startsAt.getTime() ? occurrence : null;
}

export function getPendingWeeklyReviewOccurrence(
  preferences: WeeklyReviewPreferences,
  reviews: WeeklyReview[],
  now = new Date()
): Date | null {
  const occurrence = getLatestWeeklyReviewOccurrence(preferences, now);
  if (!occurrence) return null;

  const occurrenceTime = occurrence.getTime();
  const alreadyCompleted = reviews.some((review) => {
    const scheduledFor = Date.parse(review.scheduledFor);
    return !Number.isNaN(scheduledFor) && scheduledFor === occurrenceTime;
  });

  return alreadyCompleted ? null : occurrence;
}

export function getPreviousWeeklyReview(
  reviews: WeeklyReview[],
  before: Date | string
): WeeklyReview | null {
  const beforeTime = typeof before === 'string' ? Date.parse(before) : before.getTime();
  if (Number.isNaN(beforeTime)) return null;

  return (
    [...reviews]
      .filter((review) => {
        const scheduledFor = Date.parse(review.scheduledFor);
        return !Number.isNaN(scheduledFor) && scheduledFor < beforeTime;
      })
      .sort((left, right) => right.scheduledFor.localeCompare(left.scheduledFor))[0] ?? null
  );
}

export function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function isEveningCheckInDue(
  checkIns: CheckIn[],
  now = new Date(),
  dueHour = 20
): boolean {
  if (now.getHours() < dueHour) return false;

  return !checkIns.some((checkIn) => {
    if (checkIn.kind !== 'evening') return false;
    const createdAt = new Date(checkIn.createdAt);
    return !Number.isNaN(createdAt.getTime()) && isSameLocalDay(createdAt, now);
  });
}

export type ReflectionPrompt =
  | { kind: 'weekly-review'; scheduledFor: string }
  | { kind: 'evening-check-in' }
  | null;

export function getReflectionPrompt(
  preferences: WeeklyReviewPreferences,
  reviews: WeeklyReview[],
  checkIns: CheckIn[],
  now = new Date()
): ReflectionPrompt {
  const weeklyOccurrence = getPendingWeeklyReviewOccurrence(preferences, reviews, now);
  if (weeklyOccurrence) {
    return { kind: 'weekly-review', scheduledFor: weeklyOccurrence.toISOString() };
  }
  return isEveningCheckInDue(checkIns, now) ? { kind: 'evening-check-in' } : null;
}

export function formatWeeklyReviewSchedule(preferences: WeeklyReviewPreferences): string {
  if (!preferences.enabled || !isValidWeeklyReviewSchedule(preferences)) return 'Not scheduled';

  const time = new Date();
  time.setHours(preferences.hour, preferences.minute, 0, 0);
  return `${WEEKDAY_LABELS[preferences.weekday - 1]} at ${time.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}
