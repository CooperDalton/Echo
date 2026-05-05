export const BUCKETS = [
  'Business Ideas',
  'Reflections',
  'Game Dev',
  'Family',
  'Systems',
] as const;

export type BucketName = (typeof BUCKETS)[number];

export type NoteClassificationStatus = 'pending' | 'classified' | 'failed';
export type NoteClassificationMethod = 'ai' | 'keyword' | 'unknown';

export type EchoSchedule = {
  enabled: boolean;
  state: 'new' | 'due' | 'reviewed';
  lastReviewedAt: string | null;
  nextDueAt: string;
  intervalDays: number;
  ease: number;
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
  echo: EchoSchedule;
  filePath: string | null;
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
};
