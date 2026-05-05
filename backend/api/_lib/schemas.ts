import { z } from 'zod';

import { BUCKETS, CHECK_IN_EMOTIONS, type CheckIn, type Note } from '../../src/contracts';

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
  echo: z.object({
    enabled: z.boolean(),
    state: z.enum(['new', 'due', 'reviewed']),
    lastReviewedAt: z.string().nullable(),
    nextDueAt: z.string(),
    intervalDays: z.number(),
    ease: z.number(),
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

export const repoSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  branch: z.string().min(1).default('main'),
});

export const classifyRequestSchema = z.object({
  repo: repoSchema.partial().optional(),
  note: noteSchema.pick({
    id: true,
    title: true,
    body: true,
    createdAt: true,
    updatedAt: true,
  }),
});

export const syncRequestSchema = z.object({
  deviceId: z.string().min(1),
  repo: repoSchema,
  snapshot: z.object({
    notes: z.array(noteSchema),
    checkIns: z.array(checkInSchema),
  }),
});
