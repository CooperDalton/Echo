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

import { classifyNoteBucket } from '@/lib/notes/classify-note';
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

type NotesContextValue = {
  hydrated: boolean;
  recent: Note[];
  reviewed: Note[];
  checkIns: CheckIn[];
  addRecentNote: (body: string) => void;
  addCheckIn: (input: AddCheckInInput) => void;
  markRecentAsReviewed: (noteId: string) => void;
  deleteRecentNote: (noteId: string) => void;
  deleteReviewedNote: (noteId: string) => void;
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
  const inFlightClassifications = useRef(new Set<string>());

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const loaded = await loadNotesState();
      if (!isMounted) return;
      setState(loaded);
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

  const queueClassification = useCallback((noteId: string, body: string) => {
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
        const bucket = await classifyNoteBucket(body);
        setState((prev) =>
          updateNoteInState(prev, noteId, (note) => {
            if (note.bucket) return note;
            return {
              ...note,
              bucket,
              classificationStatus: 'classified',
            };
          })
        );
      } catch {
        setState((prev) =>
          updateNoteInState(prev, noteId, (note) => ({
            ...note,
            classificationStatus: 'failed',
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
      queueClassification(note.id, note.body);
    });
  }, [hydrated, state.recent, state.reviewed, queueClassification]);

  const addRecentNote = useCallback(
    (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;

      const note = createNote(trimmed);
      setState((prev) => ({ ...prev, recent: [note, ...prev.recent] }));
      queueClassification(note.id, note.body);
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

  const value = useMemo<NotesContextValue>(
    () => ({
      hydrated,
      recent: state.recent,
      reviewed: state.reviewed,
      checkIns: state.checkIns,
      addRecentNote,
      addCheckIn,
      markRecentAsReviewed,
      deleteRecentNote,
      deleteReviewedNote,
    }),
    [
      hydrated,
      state.recent,
      state.reviewed,
      state.checkIns,
      addRecentNote,
      addCheckIn,
      markRecentAsReviewed,
      deleteRecentNote,
      deleteReviewedNote,
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
