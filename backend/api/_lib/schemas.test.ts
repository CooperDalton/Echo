import assert from 'node:assert/strict';
import test from 'node:test';

import { syncRequestSchema } from './schemas';

test('sync accepts Swift payloads with omitted nil optionals and Supabase timestamp offsets', () => {
  const parsed = syncRequestSchema.parse({
    deviceId: 'test-device',
    snapshot: {
      notes: [
        {
          id: 'note-1',
          title: 'Test note',
          body: 'Body',
          createdAt: '2026-08-21T18:00:00Z',
          updatedAt: '2026-08-21T18:00:00Z',
          classificationStatus: 'pending',
          classificationMethod: 'unknown',
          echo: {
            enabled: true,
            state: 'new',
            nextDueAt: '2026-08-22T18:00:00Z',
            intervalDays: 1,
            ease: 2.5,
            occurrenceCount: 0,
            scheduledDates: [],
          },
        },
      ],
      checkIns: [
        {
          id: 'check-in-1',
          createdAt: '2026-08-21T18:00:00Z',
          kind: 'evening',
          source: 'mobile',
          energy: 3,
          emotions: {
            happy: false,
            content: false,
            excited: false,
            bliss: false,
            anxious: false,
            overwhelmed: false,
            sad: false,
            angry: false,
          },
          body: 'Fine',
        },
      ],
      deletedNotes: [
        {
          id: 'deleted-note-1',
          deletedAt: '2026-08-21T18:00:00Z',
        },
      ],
      bucketPreferences: { customs: [] },
      standingMessages: [],
      weeklyReviews: [],
      weeklyReviewPreferences: {
        enabled: false,
        weekday: 1,
        hour: 18,
        minute: 0,
        startsAt: '2026-08-11T03:55:13.565+00:00',
        updatedAt: '2026-08-21T18:54:36.997998+00:00',
      },
      dailyCheckInPreferences: {
        enabled: true,
        times: [{ hour: 20, minute: 0 }],
        updatedAt: '2026-08-21T18:54:37.075625+00:00',
      },
    },
  });

  assert.equal(parsed.snapshot.notes[0].bucket, null);
  assert.equal(parsed.snapshot.notes[0].classificationConfidence, null);
  assert.equal(parsed.snapshot.notes[0].widgetText, null);
  assert.equal(parsed.snapshot.notes[0].echo.lastReviewedAt, null);
  assert.equal(parsed.snapshot.notes[0].filePath, null);
  assert.equal(parsed.snapshot.checkIns[0].filePath, null);
  assert.equal(parsed.snapshot.deletedNotes[0].filePath, null);
  assert.equal(parsed.snapshot.weeklyReviewPreferences.startsAt, '2026-08-11T03:55:13.565+00:00');
  assert.equal(parsed.snapshot.weeklyReviewPreferences.updatedAt, '2026-08-21T18:54:36.997998+00:00');
  assert.equal(parsed.snapshot.dailyCheckInPreferences.updatedAt, '2026-08-21T18:54:37.075625+00:00');
});
