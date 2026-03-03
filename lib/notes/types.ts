import type { BucketName } from '@/constants/buckets';

export type NoteClassificationStatus = 'pending' | 'classified' | 'failed';

export type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  bucket: BucketName | null;
  classificationStatus: NoteClassificationStatus;
};

export type NotesState = {
  recent: Note[];
  reviewed: Note[];
};

export const EMPTY_NOTES_STATE: NotesState = {
  recent: [],
  reviewed: [],
};
