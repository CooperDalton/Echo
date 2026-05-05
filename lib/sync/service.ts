import type { CheckIn, Note, NotesState } from '@/lib/notes/types';
import { classifyNoteRemotely, syncVaultSnapshot } from '@/lib/sync/client';
import { isSyncConfigured, loadSyncConfig } from '@/lib/sync/config';
import type { RemoteNoteClassification, SyncResult } from '@/lib/sync/types';

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

function mergeSyncedState(localState: NotesState, remoteResult: SyncResult): NotesState {
  const remoteNotes = mergeNotes([], [...remoteResult.state.recent, ...remoteResult.state.reviewed]);
  const allNotes = mergeNotes([...localState.recent, ...localState.reviewed], remoteNotes);

  return {
    recent: allNotes.filter((note) => note.echo.state !== 'reviewed'),
    reviewed: allNotes.filter((note) => note.echo.state === 'reviewed'),
    checkIns: mergeCheckIns(localState.checkIns, remoteResult.state.checkIns),
  };
}

export async function classifyNoteViaBackend(
  note: Pick<Note, 'id' | 'title' | 'body' | 'createdAt' | 'updatedAt'>
): Promise<RemoteNoteClassification | null> {
  const config = await loadSyncConfig();
  return classifyNoteRemotely(config, note);
}

export async function runVaultSync(state: NotesState): Promise<SyncResult> {
  const config = await loadSyncConfig();
  if (!isSyncConfigured(config)) {
    throw new Error('Sync is not configured.');
  }

  const result = await syncVaultSnapshot(config, state);
  return {
    ...result,
    state: mergeSyncedState(state, result),
  };
}
