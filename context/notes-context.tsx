import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { classifyNote } from '@/lib/notes/classify-note';
import {
  createCheckInFilePath,
  createNoteFilePath,
  deleteVaultFile,
  loadNotesState,
  saveNotesState,
} from '@/lib/notes/storage';
import {
  CHECK_IN_EMOTIONS,
  EMPTY_NOTES_STATE,
  type CheckIn,
  type CheckInEmotion,
  type CheckInKind,
  type EchoSchedule,
  type Note,
  type NotesState,
} from '@/lib/notes/types';
import { loadSyncConfig, syncPendingReason } from '@/lib/sync/config';
import { runVaultSync } from '@/lib/sync/service';
import type { EchoSyncConfig, SyncStatus } from '@/lib/sync/types';

type NotesContextValue = {
  hydrated: boolean;
  recent: Note[];
  reviewed: Note[];
  checkIns: CheckIn[];
  syncConfig: EchoSyncConfig | null;
  syncStatus: SyncStatus;
  addRecentNote: (body: string) => void;
  addCheckIn: (input: AddCheckInInput) => void;
  markRecentAsReviewed: (noteId: string) => void;
  deleteRecentNote: (noteId: string) => void;
  deleteReviewedNote: (noteId: string) => void;
  syncNow: () => Promise<void>;
};

const NotesContext = createContext<NotesContextValue | null>(null);

export type AddCheckInInput = {
  kind: CheckInKind;
  energy: number;
  emotions: Record<CheckInEmotion, boolean>;
  body: string;
};

function createNoteTitle(body: string): string {
  const compact = body.replace(/\s+/g, ' ').trim();
  if (compact.length <= 48) return compact;
  return `${compact.slice(0, 48).trimEnd()}...`;
}

function createEchoSchedule(createdAt: string): EchoSchedule {
  const nextDue = new Date(createdAt);
  nextDue.setDate(nextDue.getDate() + 1);

  return {
    enabled: true,
    state: 'new',
    lastReviewedAt: null,
    nextDueAt: nextDue.toISOString(),
    intervalDays: 1,
    ease: 2.5,
  };
}

function createNote(body: string): Note {
  const createdAt = new Date().toISOString();
  const note: Note = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: createNoteTitle(body),
    body,
    createdAt,
    updatedAt: createdAt,
    bucket: null,
    classificationStatus: 'pending',
    classificationMethod: 'unknown',
    classificationConfidence: null,
    echo: createEchoSchedule(createdAt),
    filePath: null,
  };

  return {
    ...note,
    filePath: createNoteFilePath(note),
  };
}

function createCheckIn(input: AddCheckInInput): CheckIn {
  const createdAt = new Date().toISOString();
  const safeEnergy = Math.min(5, Math.max(1, Math.round(input.energy)));
  const emotions = CHECK_IN_EMOTIONS.reduce(
    (result, emotion) => ({ ...result, [emotion]: input.emotions[emotion] === true }),
    {} as Record<CheckInEmotion, boolean>
  );
  const checkIn: CheckIn = {
    id: `checkin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    kind: input.kind,
    source: 'mobile',
    energy: safeEnergy,
    emotions,
    body: input.body.trim(),
    filePath: null,
  };

  return {
    ...checkIn,
    filePath: createCheckInFilePath(checkIn),
  };
}

function reviewEchoSchedule(echo: EchoSchedule): EchoSchedule {
  const reviewedAt = new Date();
  const nextInterval = Math.max(1, Math.round(echo.intervalDays * echo.ease));
  const nextDue = new Date(reviewedAt);
  nextDue.setDate(nextDue.getDate() + nextInterval);

  return {
    ...echo,
    state: 'reviewed',
    lastReviewedAt: reviewedAt.toISOString(),
    nextDueAt: nextDue.toISOString(),
    intervalDays: nextInterval,
  };
}

function updateNoteInState(
  state: NotesState,
  noteId: string,
  update: (note: Note) => Note
): NotesState {
  let didUpdate = false;

  const recent = state.recent.map((note) => {
    if (note.id !== noteId) return note;
    didUpdate = true;
    return update(note);
  });

  if (didUpdate) {
    return { ...state, recent };
  }

  const reviewed = state.reviewed.map((note) => {
    if (note.id !== noteId) return note;
    didUpdate = true;
    return update(note);
  });

  if (!didUpdate) return state;

  return { ...state, reviewed };
}

export function NotesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NotesState>(EMPTY_NOTES_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [syncConfig, setSyncConfig] = useState<EchoSyncConfig | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    configured: false,
    lastSyncedAt: null,
    lastError: null,
    pendingReason: 'Loading sync config...',
  });
  const inFlightClassifications = useRef(new Set<string>());

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const loaded = await loadNotesState();
      const loadedSyncConfig = await loadSyncConfig();
      if (!isMounted) return;
      setState(loaded);
      setSyncConfig(loadedSyncConfig);
      setSyncStatus((prev) => ({
        ...prev,
        configured: syncPendingReason(loadedSyncConfig) === null,
        pendingReason: syncPendingReason(loadedSyncConfig),
      }));
      setHydrated(true);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveNotesState(state);
  }, [state, hydrated]);

  const queueClassification = useCallback((noteSnapshot: Note) => {
    const { id: noteId } = noteSnapshot;
    if (inFlightClassifications.current.has(noteId)) return;
    inFlightClassifications.current.add(noteId);

    setState((prev) =>
      updateNoteInState(prev, noteId, (note) => {
        if (note.bucket) return note;
        return { ...note, classificationStatus: 'pending' };
      })
    );

    void (async () => {
      try {
        const result = await classifyNote(noteSnapshot);
        setState((prev) =>
          updateNoteInState(prev, noteId, (note) => {
            if (note.bucket) return note;
            return {
              ...note,
              bucket: result.bucket,
              classificationStatus: 'classified',
              classificationMethod: result.method,
              classificationConfidence: result.confidence,
            };
          })
        );
      } catch {
        setState((prev) =>
          updateNoteInState(prev, noteId, (note) => ({
            ...note,
            classificationStatus: 'failed',
            classificationMethod: 'unknown',
          }))
        );
      } finally {
        inFlightClassifications.current.delete(noteId);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const pending = [...state.recent, ...state.reviewed].filter(
      (note) => note.bucket === null && note.classificationStatus !== 'failed'
    );

    pending.forEach((note) => {
      queueClassification(note);
    });
  }, [hydrated, state.recent, state.reviewed, queueClassification]);

  const addRecentNote = useCallback(
    (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;

      const note = createNote(trimmed);
      setState((prev) => ({ ...prev, recent: [note, ...prev.recent] }));
      queueClassification(note);
    },
    [queueClassification]
  );

  const addCheckIn = useCallback((input: AddCheckInInput) => {
    const checkIn = createCheckIn(input);
    setState((prev) => ({ ...prev, checkIns: [checkIn, ...prev.checkIns] }));
  }, []);

  const markRecentAsReviewed = useCallback((noteId: string) => {
    setState((prev) => {
      const note = prev.recent.find((item) => item.id === noteId);
      if (!note) return prev;
      const reviewedNote = {
        ...note,
        updatedAt: new Date().toISOString(),
        echo: reviewEchoSchedule(note.echo),
      };

      return {
        recent: prev.recent.filter((item) => item.id !== noteId),
        reviewed: [reviewedNote, ...prev.reviewed],
        checkIns: prev.checkIns,
      };
    });
  }, []);

  const deleteRecentNote = useCallback((noteId: string) => {
    setState((prev) => ({
      ...prev,
      recent: prev.recent.filter((note) => note.id !== noteId),
    }));
    const note = state.recent.find((item) => item.id === noteId);
    void deleteVaultFile(note?.filePath ?? null);
  }, [state.recent]);

  const deleteReviewedNote = useCallback((noteId: string) => {
    setState((prev) => ({
      ...prev,
      reviewed: prev.reviewed.filter((note) => note.id !== noteId),
    }));
    const note = state.reviewed.find((item) => item.id === noteId);
    void deleteVaultFile(note?.filePath ?? null);
  }, [state.reviewed]);

  const syncNow = useCallback(async () => {
    setSyncStatus((prev) => ({
      ...prev,
      isSyncing: true,
      lastError: null,
    }));

    try {
      const result = await runVaultSync(state);
      setState(result.state);
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: false,
        configured: true,
        lastSyncedAt: result.syncedAt,
        lastError: null,
        pendingReason: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed.';
      const config = syncConfig ?? (await loadSyncConfig());
      setSyncConfig(config);
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: false,
        configured: syncPendingReason(config) === null,
        lastError: message,
        pendingReason: syncPendingReason(config),
      }));
    }
  }, [state, syncConfig]);

  const value = useMemo<NotesContextValue>(
    () => ({
      hydrated,
      recent: state.recent,
      reviewed: state.reviewed,
      checkIns: state.checkIns,
      syncConfig,
      syncStatus,
      addRecentNote,
      addCheckIn,
      markRecentAsReviewed,
      deleteRecentNote,
      deleteReviewedNote,
      syncNow,
    }),
    [
      hydrated,
      state.recent,
      state.reviewed,
      state.checkIns,
      syncConfig,
      syncStatus,
      addRecentNote,
      addCheckIn,
      markRecentAsReviewed,
      deleteRecentNote,
      deleteReviewedNote,
      syncNow,
    ]
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const value = useContext(NotesContext);
  if (!value) {
    throw new Error('useNotes must be used inside NotesProvider.');
  }
  return value;
}
