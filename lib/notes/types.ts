import type { BucketName } from '@/constants/buckets';

export type NoteClassificationStatus = 'pending' | 'classified' | 'failed';
export type NoteClassificationMethod = 'ai' | 'keyword' | 'unknown';

export type EchoSchedule = {
  enabled: boolean;
  state: 'new' | 'due' | 'reviewed';
  lastReviewedAt: string | null;
  nextDueAt: string;
  intervalDays: number;
  ease: number;
  occurrenceCount: number;
  scheduledDates: string[];
};

export type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  bucket: BucketName | null;
  classificationStatus: NoteClassificationStatus;
  classificationMethod: NoteClassificationMethod;
  classificationConfidence: number | null;
  widgetText: string | null;
  echo: EchoSchedule;
  filePath: string | null;
};

export type StandingMessage = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type WidgetEntry = {
  id: string;
  kind: 'echo' | 'standing' | 'empty';
  text: string;
  targetUrl: string | null;
  noteId?: string;
  standingMessageId?: string;
};

export type DeletedNote = {
  id: string;
  filePath: string | null;
  deletedAt: string;
};

export type BucketDraft = {
  name: string;
  description: string;
  colorKey: string;
};

export type BucketPreferences = {
  builtins: Partial<Record<BucketName, BucketDraft>>;
  customs: BucketDraft[];
};

export const CHECK_IN_EMOTIONS = [
  'happy',
  'content',
  'excited',
  'bliss',
  'anxious',
  'overwhelmed',
  'sad',
  'angry',
] as const;

export type CheckInEmotion = (typeof CHECK_IN_EMOTIONS)[number];

export type CheckInKind = 'evening' | 'random';

export type CheckIn = {
  id: string;
  createdAt: string;
  kind: CheckInKind;
  source: 'mobile' | 'obsidian';
  energy: number;
  emotions: Record<CheckInEmotion, boolean>;
  body: string;
  filePath: string | null;
};

export type NotesState = {
  recent: Note[];
  reviewed: Note[];
  checkIns: CheckIn[];
  deletedNotes: DeletedNote[];
  bucketPreferences: BucketPreferences;
  standingMessages: StandingMessage[];
};

export const EMPTY_NOTES_STATE: NotesState = {
  recent: [],
  reviewed: [],
  checkIns: [],
  deletedNotes: [],
  bucketPreferences: {
    builtins: {},
    customs: [],
  },
  standingMessages: [],
};
