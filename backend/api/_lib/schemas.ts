import { z } from 'zod';

import { BUCKETS, CHECK_IN_EMOTIONS, type BucketDraft, type BucketPreferences, type CheckIn, type DeletedNote, type Note, type StandingMessage } from '../../src/contracts';

const bucketSchema = z.enum(BUCKETS);

export const noteSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  bucket: bucketSchema.nullable(),
  classificationStatus: z.enum(['pending', 'classified', 'failed']),
  classificationMethod: z.enum(['ai', 'keyword', 'unknown']),
  classificationConfidence: z.number().nullable(),
  widgetText: z.string().nullable().default(null),
  echo: z.object({
    enabled: z.boolean(),
    state: z.enum(['new', 'due', 'reviewed']),
    lastReviewedAt: z.string().nullable(),
    nextDueAt: z.string(),
    intervalDays: z.number(),
    ease: z.number(),
    occurrenceCount: z.number().default(0),
    scheduledDates: z.array(z.string()).default([]),
  }),
  filePath: z.string().nullable(),
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
  filePath: z.string().nullable(),
}) satisfies z.ZodType<CheckIn>;

export const deletedNoteSchema = z.object({
  id: z.string().min(1),
  filePath: z.string().nullable(),
  deletedAt: z.string().min(1),
}) satisfies z.ZodType<DeletedNote>;

export const standingMessageSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}) satisfies z.ZodType<StandingMessage>;

export const bucketDraftSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  colorKey: z.string().min(1),
}) satisfies z.ZodType<BucketDraft>;

export const bucketPreferencesSchema = z.object({
  builtins: z.object(
    Object.fromEntries(BUCKETS.map((bucket) => [bucket, bucketDraftSchema.optional()])) as Record<
      (typeof BUCKETS)[number],
      z.ZodOptional<typeof bucketDraftSchema>
    >
  ).default({}),
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
    bucketPreferences: bucketPreferencesSchema.default({ builtins: {}, customs: [] }),
    standingMessages: z.array(standingMessageSchema).default([]),
  }),
});
