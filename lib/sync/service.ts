import type { BucketDraft, CheckIn, DeletedNote, Note, NotesState } from '@/lib/notes/types';
import { classifyNoteRemotely, shortenWidgetNoteRemotely, syncRemoteSnapshot } from '@/lib/sync/client';
import { isSyncConfigured, loadSyncConfig } from '@/lib/sync/config';
import type { RemoteNoteClassification, RemoteWidgetShortening, SyncResult } from '@/lib/sync/types';

function compareIsoDates(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
  if (Number.isNaN(leftTime)) return -1;
  if (Number.isNaN(rightTime)) return 1;
  return leftTime - rightTime;
}

function mergeNotes(local: Note[], remote: Note[]): Note[] {
  const map = new Map<string, Note>();

  [...local, ...remote].forEach((note) => {
    const existing = map.get(note.id);
    if (!existing) {
      map.set(note.id, note);
      return;
    }

    map.set(
      note.id,
      compareIsoDates(note.updatedAt, existing.updatedAt) >= 0 ? note : existing
    );
  });

  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mergeCheckIns(local: CheckIn[], remote: CheckIn[]): CheckIn[] {
  const map = new Map<string, CheckIn>();

  [...local, ...remote].forEach((checkIn) => {
    const existing = map.get(checkIn.id);
    if (!existing) {
      map.set(checkIn.id, checkIn);
      return;
    }

    map.set(
      checkIn.id,
      compareIsoDates(checkIn.createdAt, existing.createdAt) >= 0 ? checkIn : existing
    );
  });

  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mergeWeeklyReviews(
  local: NotesState['weeklyReviews'],
  remote: NotesState['weeklyReviews']
): NotesState['weeklyReviews'] {
  const map = new Map<string, NotesState['weeklyReviews'][number]>();

  [...remote, ...local].forEach((review) => {
    const existing = map.get(review.id);
    if (!existing || compareIsoDates(review.updatedAt, existing.updatedAt) > 0) {
      map.set(review.id, review);
    }
  });

  return [...map.values()].sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
}

function mergeWeeklyReviewPreferences(
  local: NotesState['weeklyReviewPreferences'],
  remote: NotesState['weeklyReviewPreferences']
): NotesState['weeklyReviewPreferences'] {
  if (!local.updatedAt) return remote;
  if (!remote.updatedAt) return local;
  return compareIsoDates(local.updatedAt, remote.updatedAt) >= 0 ? local : remote;
}

function mergeDeletedNotes(local: DeletedNote[], remote: DeletedNote[]): DeletedNote[] {
  const map = new Map<string, DeletedNote>();

  [...local, ...remote].forEach((deletedNote) => {
    const existing = map.get(deletedNote.id);
    if (!existing) {
      map.set(deletedNote.id, deletedNote);
      return;
    }

    map.set(
      deletedNote.id,
      compareIsoDates(deletedNote.deletedAt, existing.deletedAt) >= 0
        ? deletedNote
        : existing
    );
  });

  return [...map.values()].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

function mergeBucketPreferences(
  local: NotesState['bucketPreferences'],
  remote: NotesState['bucketPreferences']
): NotesState['bucketPreferences'] {
  void remote;
  return {
    customs: local.customs,
  };
}

function mergeSyncedState(localState: NotesState, remoteResult: SyncResult): NotesState {
  const deletedNotes = mergeDeletedNotes(localState.deletedNotes, remoteResult.state.deletedNotes);
  const bucketPreferences = mergeBucketPreferences(
    localState.bucketPreferences,
    remoteResult.state.bucketPreferences
  );
  const deletedIds = new Set(deletedNotes.map((deletedNote) => deletedNote.id));
  const remoteNotes = mergeNotes([], [...remoteResult.state.recent, ...remoteResult.state.reviewed]);
  const allNotes = mergeNotes([...localState.recent, ...localState.reviewed], remoteNotes).filter(
    (note) => !deletedIds.has(note.id)
  );

  return {
    recent: allNotes.filter((note) => note.echo.state !== 'reviewed'),
    reviewed: allNotes.filter((note) => note.echo.state === 'reviewed'),
    checkIns: mergeCheckIns(localState.checkIns, remoteResult.state.checkIns),
    deletedNotes,
    bucketPreferences,
    standingMessages:
      localState.standingMessages.length > 0
        ? localState.standingMessages
        : remoteResult.state.standingMessages,
    widgetPreferences: localState.widgetPreferences,
    weeklyReviews: mergeWeeklyReviews(
      localState.weeklyReviews,
      remoteResult.state.weeklyReviews
    ),
    weeklyReviewPreferences: mergeWeeklyReviewPreferences(
      localState.weeklyReviewPreferences,
      remoteResult.state.weeklyReviewPreferences
    ),
  };
}

export async function classifyNoteViaBackend(
  note: Pick<Note, 'id' | 'title' | 'body' | 'createdAt' | 'updatedAt'>,
  buckets: BucketDraft[]
): Promise<RemoteNoteClassification | null> {
  const config = await loadSyncConfig();
  return classifyNoteRemotely(config, note, buckets);
}

export async function runSupabaseSync(state: NotesState): Promise<SyncResult> {
  const config = await loadSyncConfig();
  if (!isSyncConfigured(config)) {
    throw new Error('Sync is not configured.');
  }

  const result = await syncRemoteSnapshot(config, state);
  return {
    ...result,
    state: mergeSyncedState(state, result),
  };
}

export async function shortenWidgetNoteViaBackend(
  note: Pick<Note, 'id' | 'title' | 'body'>,
  maxLength: number
): Promise<RemoteWidgetShortening | null> {
  const config = await loadSyncConfig();
  return shortenWidgetNoteRemotely(config, note, maxLength);
}
