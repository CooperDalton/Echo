import { z } from 'zod';

import {
  CHECK_IN_EMOTIONS,
  type BucketDraft,
  type BucketPreferences,
  type CheckIn,
  type DailyCheckInPreferences,
  type DeletedNote,
  type Note,
  type StandingMessage,
  type WeeklyReview,
  type WeeklyReviewPreferences,
} from '../../src/contracts';

export const noteSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  bucket: z.string().min(1).nullable().default(null),
  classificationStatus: z.enum(['pending', 'classified', 'failed']),
  classificationMethod: z.enum(['ai', 'manual', 'keyword', 'unknown']),
  classificationConfidence: z.number().nullable().default(null),
  widgetText: z.string().nullable().default(null),
  echo: z.object({
    enabled: z.boolean(),
    state: z.enum(['new', 'due', 'reviewed']),
    lastReviewedAt: z.string().nullable().default(null),
    nextDueAt: z.string(),
    intervalDays: z.number(),
    ease: z.number(),
    occurrenceCount: z.number().default(0),
    scheduledDates: z.array(z.string()).default([]),
  }),
  filePath: z.string().nullable().default(null),
}) satisfies z.ZodType<Note>;

export const checkInSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  kind: z.enum(['evening', 'random']),
  source: z.enum(['mobile', 'obsidian']),
  energy: z.number().min(1).max(5),
  emotions: z.object(
    Object.fromEntries(CHECK_IN_EMOTIONS.map((emotion) => [emotion, z.boolean()])) as Record<
      (typeof CHECK_IN_EMOTIONS)[number],
      z.ZodBoolean
    >
  ),
  body: z.string(),
  filePath: z.string().nullable().default(null),
}) satisfies z.ZodType<CheckIn>;

export const deletedNoteSchema = z.object({
  id: z.string().min(1),
  filePath: z.string().nullable().default(null),
  deletedAt: z.string().min(1),
}) satisfies z.ZodType<DeletedNote>;

export const standingMessageSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}) satisfies z.ZodType<StandingMessage>;

export const weeklyReviewSchema = z.object({
  id: z.string().min(1),
  scheduledFor: z.string().datetime(),
  completedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reflection: z.string().trim().min(1),
  nextWeekIntent: z.string().trim().min(1),
}) satisfies z.ZodType<WeeklyReview>;

export const weeklyReviewPreferencesSchema = z.object({
  enabled: z.boolean(),
  weekday: z.number().int().min(1).max(7),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  startsAt: z.string().datetime().nullable().default(null),
  updatedAt: z.string().datetime().nullable().default(null),
}) satisfies z.ZodType<WeeklyReviewPreferences>;

export const dailyCheckInPreferencesSchema = z.object({
  enabled: z.boolean(),
  times: z.array(z.object({
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  })).max(5),
  updatedAt: z.string().datetime().nullable().default(null),
}) satisfies z.ZodType<DailyCheckInPreferences>;

export const bucketDraftSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  colorKey: z.string().min(1),
}) satisfies z.ZodType<BucketDraft>;

export const bucketPreferencesSchema = z.object({
  customs: z.array(bucketDraftSchema).default([]),
}) satisfies z.ZodType<BucketPreferences>;

export const repoSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  branch: z.string().min(1).default('main'),
});

export const classifyRequestSchema = z.object({
  note: noteSchema.pick({
    id: true,
    title: true,
    body: true,
    createdAt: true,
    updatedAt: true,
  }),
  buckets: z.array(bucketDraftSchema).default([]),
});

export const shortenWidgetNoteRequestSchema = z.object({
  note: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    body: z.string().min(1),
  }),
  maxLength: z.number().int().positive().max(400).default(180),
});

export const syncRequestSchema = z.object({
  deviceId: z.string().min(1),
  snapshot: z.object({
    notes: z.array(noteSchema),
    checkIns: z.array(checkInSchema),
    deletedNotes: z.array(deletedNoteSchema).default([]),
    bucketPreferences: bucketPreferencesSchema.default({ customs: [] }),
    standingMessages: z.array(standingMessageSchema).default([]),
    weeklyReviews: z.array(weeklyReviewSchema).default([]),
    weeklyReviewPreferences: weeklyReviewPreferencesSchema.default({
      enabled: false,
      weekday: 1,
      hour: 18,
      minute: 0,
      startsAt: null,
      updatedAt: null,
    }),
    dailyCheckInPreferences: dailyCheckInPreferencesSchema.default({
      enabled: true,
      times: [{ hour: 20, minute: 0 }],
      updatedAt: null,
    }),
  }),
});
