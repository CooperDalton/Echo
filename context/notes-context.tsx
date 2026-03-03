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
import { loadNotesState, saveNotesState } from '@/lib/notes/storage';
import { EMPTY_NOTES_STATE, type Note, type NotesState } from '@/lib/notes/types';

type NotesContextValue = {
  hydrated: boolean;
  recent: Note[];
  reviewed: Note[];
  addRecentNote: (body: string) => void;
  markRecentAsReviewed: (noteId: string) => void;
  deleteRecentNote: (noteId: string) => void;
  deleteReviewedNote: (noteId: string) => void;
};

const NotesContext = createContext<NotesContextValue | null>(null);

function createNoteTitle(body: string): string {
  const compact = body.replace(/\s+/g, ' ').trim();
  if (compact.length <= 48) return compact;
  return `${compact.slice(0, 48).trimEnd()}...`;
}

function createNote(body: string): Note {
  return {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: createNoteTitle(body),
    body,
    createdAt: new Date().toISOString(),
    bucket: null,
    classificationStatus: 'pending',
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

  const markRecentAsReviewed = useCallback((noteId: string) => {
    setState((prev) => {
      const note = prev.recent.find((item) => item.id === noteId);
      if (!note) return prev;

      return {
        recent: prev.recent.filter((item) => item.id !== noteId),
        reviewed: [note, ...prev.reviewed],
      };
    });
  }, []);

  const deleteRecentNote = useCallback((noteId: string) => {
    setState((prev) => ({
      ...prev,
      recent: prev.recent.filter((note) => note.id !== noteId),
    }));
  }, []);

  const deleteReviewedNote = useCallback((noteId: string) => {
    setState((prev) => ({
      ...prev,
      reviewed: prev.reviewed.filter((note) => note.id !== noteId),
    }));
  }, []);

  const value = useMemo<NotesContextValue>(
    () => ({
      hydrated,
      recent: state.recent,
      reviewed: state.reviewed,
      addRecentNote,
      markRecentAsReviewed,
      deleteRecentNote,
      deleteReviewedNote,
    }),
    [
      hydrated,
      state.recent,
      state.reviewed,
      addRecentNote,
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
