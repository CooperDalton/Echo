import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';

import { classifyNote } from '@/lib/notes/classify-note';
import {
  createCheckInFilePath,
  createNoteFilePath,
  loadNotesState,
  saveNotesState,
} from '@/lib/notes/storage';
import {
  type BucketDraft,
  type BucketPreferences,
  CHECK_IN_EMOTIONS,
  EMPTY_NOTES_STATE,
  type CheckIn,
  type CheckInEmotion,
  type CheckInKind,
  type DeletedNote,
  type EchoSchedule,
  type Note,
  type NotesState,
  type StandingMessage,
  type WidgetPreferences,
} from '@/lib/notes/types';
import { loadSyncConfig, syncPendingReason } from '@/lib/sync/config';
import { runSupabaseSync, shortenWidgetNoteViaBackend } from '@/lib/sync/service';
import type { EchoSyncConfig, SyncStatus } from '@/lib/sync/types';
import { compactWidgetText, WIDGET_TEXT_LIMIT } from '@/lib/widgets/entries';
import { createEchoScheduleForNote } from '@/lib/widgets/schedule';
import { updateEchoWidget } from '@/lib/widgets/update';

type NotesContextValue = {
  hydrated: boolean;
  recent: Note[];
  reviewed: Note[];
  checkIns: CheckIn[];
  bucketPreferences: BucketPreferences;
  standingMessages: StandingMessage[];
  widgetPreferences: WidgetPreferences;
  syncConfig: EchoSyncConfig | null;
  syncStatus: SyncStatus;
  addRecentNote: (body: string, options?: { echoEnabled?: boolean }) => void;
  addCheckIn: (input: AddCheckInInput) => void;
  updateCheckIn: (checkInId: string, input: UpdateCheckInInput) => void;
  markRecentAsReviewed: (noteId: string) => void;
  deleteRecentNote: (noteId: string) => void;
  deleteReviewedNote: (noteId: string) => void;
  addCustomBucketDraft: (draft: BucketDraft) => void;
  updateCustomBucketDraft: (index: number, draft: BucketDraft) => void;
  deleteCustomBucketDraft: (index: number) => void;
  upsertStandingMessage: (messageId: string | null, text: string) => void;
  deleteStandingMessage: (messageId: string) => void;
  setWidgetEnabled: (enabled: boolean) => void;
  setWidgetStandingMessagesEnabled: (enabled: boolean) => void;
  syncNow: () => Promise<void>;
};

const NotesContext = createContext<NotesContextValue | null>(null);
const SHORT_NOTE_BODY_LIMIT = 32;
const AUTO_SYNC_DEBOUNCE_MS = 8000;
const STALE_SYNC_MS = 60000;
const SYNC_FAILURE_NOTIFICATION_ID = 'echo-sync-failure';

export type AddCheckInInput = {
  kind: CheckInKind;
  energy: number;
  emotions: Record<CheckInEmotion, boolean>;
  body: string;
};

export type UpdateCheckInInput = {
  energy: number;
  emotions: Record<CheckInEmotion, boolean>;
  body: string;
};

function createNoteTitle(body: string): string {
  const compact = body.replace(/\s+/g, ' ').trim();
  if (compact.length <= SHORT_NOTE_BODY_LIMIT) return compact;
  return `${compact.slice(0, 23).trimEnd()}...`;
}

function isShortNote(body: string): boolean {
  return body.replace(/\s+/g, ' ').trim().length <= SHORT_NOTE_BODY_LIMIT;
}

function isSyncStale(lastSyncedAt: string | null): boolean {
  if (!lastSyncedAt) return true;
  const syncedAt = Date.parse(lastSyncedAt);
  if (Number.isNaN(syncedAt)) return true;
  return Date.now() - syncedAt >= STALE_SYNC_MS;
}

async function notifySyncFailure(message: string): Promise<void> {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) return;

    await Notifications.scheduleNotificationAsync({
      identifier: SYNC_FAILURE_NOTIFICATION_ID,
      content: {
        title: 'Sync failed',
        body: message,
      },
      trigger: null,
    });
  } catch {
    // Surface sync errors in app state even if notifications are unavailable.
  }
}

function createNote(
  body: string,
  existingNotes: Note[],
  options: { echoEnabled: boolean }
): Note {
  const createdAt = new Date().toISOString();
  const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const echo = createEchoScheduleForNote(id, createdAt, existingNotes);
  const note: Note = {
    id,
    title: createNoteTitle(body),
    body,
    createdAt,
    updatedAt: createdAt,
    bucket: null,
    classificationStatus: options.echoEnabled ? 'classified' : 'pending',
    classificationMethod: 'unknown',
    classificationConfidence: null,
    widgetText: body.replace(/\s+/g, ' ').trim().length <= WIDGET_TEXT_LIMIT ? body : null,
    echo: {
      ...echo,
      enabled: options.echoEnabled,
    },
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
  const occurrenceCount = Math.min(echo.scheduledDates.length, echo.occurrenceCount + 1);
  const nextDate = echo.scheduledDates[occurrenceCount] ?? echo.scheduledDates.at(-1);

  return {
    ...echo,
    state: 'reviewed',
    lastReviewedAt: reviewedAt.toISOString(),
    nextDueAt: nextDate ? new Date(`${nextDate}T09:00:00`).toISOString() : echo.nextDueAt,
    intervalDays: echo.intervalDays,
    occurrenceCount,
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

function createDeletedNote(note: Note): DeletedNote {
  return {
    id: note.id,
    filePath: note.filePath,
    deletedAt: new Date().toISOString(),
  };
}

function upsertDeletedNote(deletedNotes: DeletedNote[], nextDeletedNote: DeletedNote): DeletedNote[] {
  const existingIndex = deletedNotes.findIndex((deletedNote) => deletedNote.id === nextDeletedNote.id);
  if (existingIndex === -1) {
    return [nextDeletedNote, ...deletedNotes];
  }

  return deletedNotes.map((deletedNote, index) =>
    index === existingIndex ? nextDeletedNote : deletedNote
  );
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
  const inFlightWidgetShortenings = useRef(new Set<string>());
  const stateRef = useRef(state);
  const hydratedRef = useRef(hydrated);
  const syncConfigRef = useRef(syncConfig);
  const syncStatusRef = useRef(syncStatus);
  const dirtyRef = useRef(false);
  const initialSyncStartedRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitState = useCallback((updater: SetStateAction<NotesState>) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? (updater as (value: NotesState) => NotesState)(prev) : updater;
      stateRef.current = next;
      return next;
    });
  }, []);

  const clearAutoSyncTimer = useCallback(() => {
    if (!debounceTimerRef.current) return;
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
  }, []);

  const performSync = useCallback(
    async (reason: 'manual' | 'debounced' | 'background' | 'foreground' | 'launch') => {
      const currentConfig = syncConfigRef.current;
      if (!hydratedRef.current || !currentConfig) return;
      if (syncStatusRef.current.isSyncing) return;
      if (syncPendingReason(currentConfig) !== null) return;

      clearAutoSyncTimer();
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: true,
        lastError: null,
      }));

      try {
        const result = await runSupabaseSync(stateRef.current);
        dirtyRef.current = false;
        stateRef.current = result.state;
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
        const config = currentConfig ?? (await loadSyncConfig());
        syncConfigRef.current = config;
        setSyncConfig(config);
        setSyncStatus((prev) => ({
          ...prev,
          isSyncing: false,
          configured: syncPendingReason(config) === null,
          lastError: message,
          pendingReason: syncPendingReason(config),
        }));
        await notifySyncFailure(message);
      }
    },
    [clearAutoSyncTimer]
  );

  const markDirtyAndScheduleSync = useCallback(() => {
    dirtyRef.current = true;
    clearAutoSyncTimer();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void performSync('debounced');
    }, AUTO_SYNC_DEBOUNCE_MS);
  }, [clearAutoSyncTimer, performSync]);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const loaded = await loadNotesState();
      const loadedSyncConfig = await loadSyncConfig();
      if (!isMounted) return;
      stateRef.current = loaded;
      setState(loaded);
      setSyncConfig(loadedSyncConfig);
      syncConfigRef.current = loadedSyncConfig;
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
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    hydratedRef.current = hydrated;
  }, [hydrated]);

  useEffect(() => {
    syncConfigRef.current = syncConfig;
  }, [syncConfig]);

  useEffect(() => {
    syncStatusRef.current = syncStatus;
  }, [syncStatus]);

  useEffect(() => {
    if (!hydrated) return;
    void saveNotesState(state);
    updateEchoWidget(state);
  }, [state, hydrated]);

  const queueClassification = useCallback((noteSnapshot: Note) => {
    const { id: noteId } = noteSnapshot;
    if (noteSnapshot.echo.enabled) return;
    if (inFlightClassifications.current.has(noteId)) return;
    const buckets = stateRef.current.bucketPreferences.customs;
    if (buckets.length === 0) return;
    inFlightClassifications.current.add(noteId);

    commitState((prev) =>
      updateNoteInState(prev, noteId, (note) => {
        if (note.bucket) return note;
        return { ...note, classificationStatus: 'pending' };
      })
    );

    void (async () => {
      try {
        const result = await classifyNote(noteSnapshot, buckets);
        commitState((prev) =>
          updateNoteInState(prev, noteId, (note) => {
            if (note.bucket) return note;
            return {
              ...note,
              title: isShortNote(note.body) ? createNoteTitle(note.body) : result.title,
              bucket: result.bucket,
              classificationStatus: 'classified',
              classificationMethod: result.method,
              classificationConfidence: result.confidence,
            };
          })
        );
        markDirtyAndScheduleSync();
      } catch {
        commitState((prev) =>
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
  }, [commitState, markDirtyAndScheduleSync]);

  const queueWidgetShortening = useCallback((noteSnapshot: Note) => {
    const compact = noteSnapshot.body.replace(/\s+/g, ' ').trim();
    if (compact.length <= WIDGET_TEXT_LIMIT || noteSnapshot.widgetText) return;
    if (inFlightWidgetShortenings.current.has(noteSnapshot.id)) return;
    inFlightWidgetShortenings.current.add(noteSnapshot.id);

    void (async () => {
      try {
        const result = await shortenWidgetNoteViaBackend(
          {
            id: noteSnapshot.id,
            title: noteSnapshot.title,
            body: noteSnapshot.body,
          },
          WIDGET_TEXT_LIMIT
        );
        commitState((prev) =>
          updateNoteInState(prev, noteSnapshot.id, (note) => ({
            ...note,
            widgetText: compactWidgetText(result?.widgetText ?? note.body),
          }))
        );
      } catch {
        commitState((prev) =>
          updateNoteInState(prev, noteSnapshot.id, (note) => ({
            ...note,
            widgetText: compactWidgetText(note.body),
          }))
        );
      } finally {
        inFlightWidgetShortenings.current.delete(noteSnapshot.id);
        markDirtyAndScheduleSync();
      }
    })();
  }, [commitState, markDirtyAndScheduleSync]);

  useEffect(() => {
    if (!hydrated) return;

    const pending = [...state.recent, ...state.reviewed].filter(
      (note) => !note.echo.enabled && note.bucket === null && note.classificationStatus === 'pending'
    );

    if (state.bucketPreferences.customs.length > 0) {
      pending.forEach((note) => {
        queueClassification(note);
      });
    }

    [...state.recent, ...state.reviewed].forEach((note) => {
      queueWidgetShortening(note);
    });
  }, [hydrated, state.recent, state.reviewed, state.bucketPreferences.customs, queueClassification, queueWidgetShortening]);

  const addRecentNote = useCallback(
    (body: string, options?: { echoEnabled?: boolean }) => {
      const trimmed = body.trim();
      if (!trimmed) return;

      const note = createNote(trimmed, [...stateRef.current.recent, ...stateRef.current.reviewed], {
        echoEnabled: options?.echoEnabled ?? false,
      });
      commitState((prev) => ({ ...prev, recent: [note, ...prev.recent] }));
      if (!note.echo.enabled) {
        queueClassification(note);
      }
      queueWidgetShortening(note);
      markDirtyAndScheduleSync();
    },
    [commitState, markDirtyAndScheduleSync, queueClassification, queueWidgetShortening]
  );

  const addCheckIn = useCallback((input: AddCheckInInput) => {
    const checkIn = createCheckIn(input);
    commitState((prev) => ({ ...prev, checkIns: [checkIn, ...prev.checkIns] }));
    markDirtyAndScheduleSync();
  }, [commitState, markDirtyAndScheduleSync]);

  const updateCheckIn = useCallback((checkInId: string, input: UpdateCheckInInput) => {
    const safeEnergy = Math.min(5, Math.max(1, Math.round(input.energy)));
    const emotions = CHECK_IN_EMOTIONS.reduce(
      (result, emotion) => ({ ...result, [emotion]: input.emotions[emotion] === true }),
      {} as Record<CheckInEmotion, boolean>
    );
    const body = input.body.trim();

    commitState((prev) => ({
      ...prev,
      checkIns: prev.checkIns.map((checkIn) =>
        checkIn.id === checkInId
          ? {
              ...checkIn,
              energy: safeEnergy,
              emotions,
              body,
            }
          : checkIn
      ),
    }));
    markDirtyAndScheduleSync();
  }, [commitState, markDirtyAndScheduleSync]);

  const markRecentAsReviewed = useCallback((noteId: string) => {
    commitState((prev) => {
      const note = prev.recent.find((item) => item.id === noteId);
      if (!note) return prev;
      const reviewedNote = {
        ...note,
        updatedAt: new Date().toISOString(),
        echo: reviewEchoSchedule(note.echo),
      };

      return {
        ...prev,
        recent: prev.recent.filter((item) => item.id !== noteId),
        reviewed: [reviewedNote, ...prev.reviewed],
      };
    });
    markDirtyAndScheduleSync();
  }, [commitState, markDirtyAndScheduleSync]);

  const deleteRecentNote = useCallback((noteId: string) => {
    commitState((prev) => {
      const note = prev.recent.find((item) => item.id === noteId);
      if (!note) return prev;

      return {
        ...prev,
        recent: prev.recent.filter((item) => item.id !== noteId),
        deletedNotes: upsertDeletedNote(prev.deletedNotes, createDeletedNote(note)),
      };
    });
    markDirtyAndScheduleSync();
  }, [commitState, markDirtyAndScheduleSync]);

  const deleteReviewedNote = useCallback((noteId: string) => {
    commitState((prev) => {
      const note = prev.reviewed.find((item) => item.id === noteId);
      if (!note) return prev;

      return {
        ...prev,
        reviewed: prev.reviewed.filter((item) => item.id !== noteId),
        deletedNotes: upsertDeletedNote(prev.deletedNotes, createDeletedNote(note)),
      };
    });
    markDirtyAndScheduleSync();
  }, [commitState, markDirtyAndScheduleSync]);

  const addCustomBucketDraft = useCallback((draft: BucketDraft) => {
    commitState((prev) => ({
      ...prev,
      bucketPreferences: {
        ...prev.bucketPreferences,
        customs: [...prev.bucketPreferences.customs, draft],
      },
    }));
    markDirtyAndScheduleSync();
  }, [commitState, markDirtyAndScheduleSync]);

  const updateCustomBucketDraft = useCallback((index: number, draft: BucketDraft) => {
    commitState((prev) => {
      const existing = prev.bucketPreferences.customs[index];
      const oldName = existing?.name;
      const renameNote = (note: Note) =>
        oldName && note.bucket === oldName ? { ...note, bucket: draft.name } : note;

      return {
        ...prev,
        recent: prev.recent.map(renameNote),
        reviewed: prev.reviewed.map(renameNote),
        bucketPreferences: {
          ...prev.bucketPreferences,
          customs: prev.bucketPreferences.customs.map((bucket, currentIndex) =>
            currentIndex === index ? draft : bucket
          ),
        },
      };
    });
    markDirtyAndScheduleSync();
  }, [commitState, markDirtyAndScheduleSync]);

  const deleteCustomBucketDraft = useCallback((index: number) => {
    commitState((prev) => {
      const deletedName = prev.bucketPreferences.customs[index]?.name;
      const clearBucket = (note: Note) =>
        deletedName && note.bucket === deletedName
          ? {
              ...note,
              bucket: null,
              classificationStatus: 'pending' as const,
              classificationMethod: 'unknown' as const,
              classificationConfidence: null,
            }
          : note;

      return {
        ...prev,
        recent: prev.recent.map(clearBucket),
        reviewed: prev.reviewed.map(clearBucket),
        bucketPreferences: {
          ...prev.bucketPreferences,
          customs: prev.bucketPreferences.customs.filter((_, currentIndex) => currentIndex !== index),
        },
      };
    });
    markDirtyAndScheduleSync();
  }, [commitState, markDirtyAndScheduleSync]);

  const upsertStandingMessage = useCallback((messageId: string | null, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();

    commitState((prev) => {
      if (messageId) {
        const didUpdate = prev.standingMessages.some((message) => message.id === messageId);
        if (didUpdate) {
          return {
            ...prev,
            standingMessages: prev.standingMessages.map((message) =>
              message.id === messageId
                ? { ...message, text: trimmed, updatedAt: now }
                : message
            ),
          };
        }
      }

      return {
        ...prev,
        standingMessages: [
          ...prev.standingMessages,
          {
            id: `standing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            text: trimmed,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
    });
    markDirtyAndScheduleSync();
  }, [commitState, markDirtyAndScheduleSync]);

  const deleteStandingMessage = useCallback((messageId: string) => {
    commitState((prev) => ({
      ...prev,
      standingMessages: prev.standingMessages.filter((message) => message.id !== messageId),
    }));
    markDirtyAndScheduleSync();
  }, [commitState, markDirtyAndScheduleSync]);

  const setWidgetEnabled = useCallback((enabled: boolean) => {
    commitState((prev) => ({
      ...prev,
      widgetPreferences: {
        ...prev.widgetPreferences,
        enabled,
      },
    }));
  }, [commitState]);

  const setWidgetStandingMessagesEnabled = useCallback((enabled: boolean) => {
    commitState((prev) => ({
      ...prev,
      widgetPreferences: {
        ...prev.widgetPreferences,
        includeStandingMessages: enabled,
      },
    }));
  }, [commitState]);

  const syncNow = useCallback(async () => {
    await performSync('manual');
  }, [performSync]);

  useEffect(() => {
    if (!hydrated || initialSyncStartedRef.current) return;
    initialSyncStartedRef.current = true;
    void performSync('launch');
  }, [hydrated, performSync]);

  useEffect(() => {
    if (!hydrated) return;

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (dirtyRef.current) {
          void performSync('background');
        }
        return;
      }

      if (nextState === 'active' && isSyncStale(syncStatusRef.current.lastSyncedAt)) {
        void performSync('foreground');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [hydrated, performSync]);

  useEffect(() => {
    return () => {
      clearAutoSyncTimer();
    };
  }, [clearAutoSyncTimer]);

  const value = useMemo<NotesContextValue>(
    () => ({
      hydrated,
      recent: state.recent,
      reviewed: state.reviewed,
      checkIns: state.checkIns,
      bucketPreferences: state.bucketPreferences,
      standingMessages: state.standingMessages,
      widgetPreferences: state.widgetPreferences,
      syncConfig,
      syncStatus,
      addRecentNote,
      addCheckIn,
      updateCheckIn,
      markRecentAsReviewed,
      deleteRecentNote,
      deleteReviewedNote,
      addCustomBucketDraft,
      updateCustomBucketDraft,
      deleteCustomBucketDraft,
      upsertStandingMessage,
      deleteStandingMessage,
      setWidgetEnabled,
      setWidgetStandingMessagesEnabled,
      syncNow,
    }),
    [
      hydrated,
      state.recent,
      state.reviewed,
      state.checkIns,
      state.bucketPreferences,
      state.standingMessages,
      state.widgetPreferences,
      syncConfig,
      syncStatus,
      addRecentNote,
      addCheckIn,
      updateCheckIn,
      markRecentAsReviewed,
      deleteRecentNote,
      deleteReviewedNote,
      addCustomBucketDraft,
      updateCustomBucketDraft,
      deleteCustomBucketDraft,
      upsertStandingMessage,
      deleteStandingMessage,
      setWidgetEnabled,
      setWidgetStandingMessagesEnabled,
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
