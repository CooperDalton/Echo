import * as FileSystem from 'expo-file-system';

import { BUCKETS, type BucketName } from '@/constants/buckets';
import {
  EMPTY_NOTES_STATE,
  type Note,
  type NoteClassificationStatus,
  type NotesState,
} from '@/lib/notes/types';

const NOTES_STORAGE_FILE = `${FileSystem.documentDirectory ?? ''}echo-notes-v1.json`;

function isBucketName(value: unknown): value is BucketName {
  return typeof value === 'string' && BUCKETS.includes(value as BucketName);
}

function isClassificationStatus(value: unknown): value is NoteClassificationStatus {
  return value === 'pending' || value === 'classified' || value === 'failed';
}

function parseNote(value: unknown): Note | null {
  if (!value || typeof value !== 'object') return null;

  const note = value as Partial<Note>;
  if (
    typeof note.id !== 'string' ||
    typeof note.title !== 'string' ||
    typeof note.body !== 'string' ||
    typeof note.createdAt !== 'string'
  ) {
    return null;
  }

  if (!(note.bucket === null || isBucketName(note.bucket))) {
    return null;
  }

  if (!isClassificationStatus(note.classificationStatus)) {
    return null;
  }

  return {
    id: note.id,
    title: note.title,
    body: note.body,
    createdAt: note.createdAt,
    bucket: note.bucket,
    classificationStatus: note.classificationStatus,
  };
}

function parseState(raw: string): NotesState {
  const parsed = JSON.parse(raw) as Partial<NotesState>;

  const recent = Array.isArray(parsed.recent)
    ? parsed.recent.map(parseNote).filter((note): note is Note => note !== null)
    : [];

  const reviewed = Array.isArray(parsed.reviewed)
    ? parsed.reviewed.map(parseNote).filter((note): note is Note => note !== null)
    : [];

  return { recent, reviewed };
}

export async function loadNotesState(): Promise<NotesState> {
  if (!NOTES_STORAGE_FILE) return EMPTY_NOTES_STATE;

  try {
    const info = await FileSystem.getInfoAsync(NOTES_STORAGE_FILE);
    if (!info.exists) return EMPTY_NOTES_STATE;

    const raw = await FileSystem.readAsStringAsync(NOTES_STORAGE_FILE);
    return parseState(raw);
  } catch {
    return EMPTY_NOTES_STATE;
  }
}

export async function saveNotesState(state: NotesState): Promise<void> {
  if (!NOTES_STORAGE_FILE) return;

  try {
    await FileSystem.writeAsStringAsync(NOTES_STORAGE_FILE, JSON.stringify(state));
  } catch {
    // Keep local state as source-of-truth even when persistence fails.
  }
}

export async function clearNotesState(): Promise<void> {
  if (!NOTES_STORAGE_FILE) return;

  try {
    const info = await FileSystem.getInfoAsync(NOTES_STORAGE_FILE);
    if (info.exists) {
      await FileSystem.deleteAsync(NOTES_STORAGE_FILE, { idempotent: true });
    }
  } catch {
    // No-op when cleanup fails.
  }
}
