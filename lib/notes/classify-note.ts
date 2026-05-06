import { BUCKETS, type BucketName } from '@/constants/buckets';
import type { Note, NoteClassificationMethod } from '@/lib/notes/types';
import { classifyNoteViaBackend } from '@/lib/sync/service';

export async function classifyNote(
  note: Pick<Note, 'id' | 'title' | 'body' | 'createdAt' | 'updatedAt'>
): Promise<{
  title: string;
  bucket: BucketName;
  confidence: number | null;
  method: NoteClassificationMethod;
}> {
  const remote = await classifyNoteViaBackend(note);
  if (remote) {
    return {
      title: remote.title,
      bucket: remote.bucket,
      confidence: remote.confidence,
      method: 'ai',
    };
  }
  throw new Error('Backend classification unavailable.');
}
