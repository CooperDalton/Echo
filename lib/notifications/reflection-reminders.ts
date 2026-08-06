import * as Notifications from 'expo-notifications';

import type { WeeklyReviewPreferences } from '@/lib/notes/types';
import { canSendNotifications } from '@/lib/notifications/permissions';
import { isValidWeeklyReviewSchedule } from '@/lib/weekly-reviews/schedule';

export const EVENING_CHECK_IN_NOTIFICATION_ID = 'echo-evening-checkin';
export const WEEKLY_REVIEW_NOTIFICATION_ID = 'echo-weekly-review';

export type ReminderScheduleStatus = 'scheduled' | 'disabled' | 'denied' | 'failed';

async function notificationPermissions(requestIfNeeded: boolean) {
  const current = await Notifications.getPermissionsAsync();
  if (canSendNotifications(current) || !requestIfNeeded) return current;
  return Notifications.requestPermissionsAsync();
}

export async function scheduleEveningCheckInReminder(
  requestPermission = false
): Promise<ReminderScheduleStatus> {
  try {
    const permissions = await notificationPermissions(requestPermission);
    if (!canSendNotifications(permissions)) return 'denied';

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
    return 'scheduled';
  } catch {
    return 'failed';
  }
}

export async function scheduleWeeklyReviewReminder(
  preferences: WeeklyReviewPreferences,
  requestPermission = false
): Promise<ReminderScheduleStatus> {
  try {
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_REVIEW_NOTIFICATION_ID);
    if (!preferences.enabled || !isValidWeeklyReviewSchedule(preferences)) return 'disabled';

    const permissions = await notificationPermissions(requestPermission);
    if (!canSendNotifications(permissions)) return 'denied';

    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_REVIEW_NOTIFICATION_ID,
      content: {
        title: 'Weekly review',
        body: 'Take a moment to reflect on this week and plan the next one.',
        data: { url: '/weekly-review' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: preferences.weekday,
        hour: preferences.hour,
        minute: preferences.minute,
      },
    });
    return 'scheduled';
  } catch {
    return 'failed';
  }
}

export async function cancelWeeklyReviewReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_REVIEW_NOTIFICATION_ID);
  } catch {
    // The in-app schedule remains authoritative if the OS call is unavailable.
  }
}
