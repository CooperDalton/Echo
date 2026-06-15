import type { BucketPreferences, CheckIn, DeletedNote, Note, NotesState, StandingMessage } from './contracts';
import { supabase } from './supabase';

type SyncSummary = {
  pushedNotes: number;
  pushedCheckIns: number;
  pulledNotes: number;
  pulledCheckIns: number;
  storedRows: number;
};

type SyncOutput = {
  state: NotesState;
  summary: SyncSummary;
};

type NoteRow = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  bucket: Note['bucket'];
  classification_status: Note['classificationStatus'];
  classification_method: Note['classificationMethod'];
  classification_confidence: number | null;
  widget_text: string | null;
  echo: Note['echo'];
  file_path: string | null;
};

type CheckInRow = {
  id: string;
  created_at: string;
  kind: CheckIn['kind'];
  source: CheckIn['source'];
  energy: number;
  emotions: CheckIn['emotions'];
  body: string;
  file_path: string | null;
};

type DeletedNoteRow = {
  id: string;
  file_path: string | null;
  deleted_at: string;
};

type BucketPreferencesRow = {
  id: 'default';
  customs: BucketPreferences['customs'];
};

type StandingMessageRow = {
  id: string;
  text: string;
  created_at: string;
  updated_at: string;
};

function compareIsoDates(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
  if (Number.isNaN(leftTime)) return -1;
  if (Number.isNaN(rightTime)) return 1;
  return leftTime - rightTime;
}

function sortNewestFirst<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mergeNotes(local: Note[], remote: Note[]): Note[] {
  const map = new Map<string, Note>();

  remote.forEach((note) => {
    map.set(note.id, note);
  });

  local.forEach((note) => {
    const existing = map.get(note.id);
    if (!existing || compareIsoDates(note.updatedAt, existing.updatedAt) > 0) {
      map.set(note.id, note);
    }
  });

  return sortNewestFirst([...map.values()]);
}

function mergeCheckIns(local: CheckIn[], remote: CheckIn[]): CheckIn[] {
  const map = new Map<string, CheckIn>();

  remote.forEach((checkIn) => {
    map.set(checkIn.id, checkIn);
  });

  local.forEach((checkIn) => {
    map.set(checkIn.id, checkIn);
  });

  return sortNewestFirst([...map.values()]);
}

function mergeDeletedNotes(local: DeletedNote[], remote: DeletedNote[]): DeletedNote[] {
  const map = new Map<string, DeletedNote>();

  remote.forEach((deletedNote) => {
    map.set(deletedNote.id, deletedNote);
  });

  local.forEach((deletedNote) => {
    const existing = map.get(deletedNote.id);
    if (!existing || compareIsoDates(deletedNote.deletedAt, existing.deletedAt) > 0) {
      map.set(deletedNote.id, deletedNote);
    }
  });

  return [...map.values()].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

function mergeBucketPreferences(
  local: BucketPreferences,
  remote: BucketPreferences
): BucketPreferences {
  void remote;
  return {
    customs: local.customs,
  };
}

function noteFromRow(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bucket: row.bucket,
    classificationStatus: row.classification_status,
    classificationMethod: row.classification_method,
    classificationConfidence: row.classification_confidence,
    widgetText: row.widget_text,
    echo: row.echo,
    filePath: row.file_path,
  };
}

function noteToRow(note: Note): NoteRow {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    bucket: note.bucket,
    classification_status: note.classificationStatus,
    classification_method: note.classificationMethod,
    classification_confidence: note.classificationConfidence,
    widget_text: note.widgetText,
    echo: note.echo,
    file_path: note.filePath,
  };
}

function checkInFromRow(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    createdAt: row.created_at,
    kind: row.kind,
    source: row.source,
    energy: row.energy,
    emotions: row.emotions,
    body: row.body,
    filePath: row.file_path,
  };
}

function checkInToRow(checkIn: CheckIn): CheckInRow {
  return {
    id: checkIn.id,
    created_at: checkIn.createdAt,
    kind: checkIn.kind,
    source: checkIn.source,
    energy: checkIn.energy,
    emotions: checkIn.emotions,
    body: checkIn.body,
    file_path: checkIn.filePath,
  };
}

function deletedNoteFromRow(row: DeletedNoteRow): DeletedNote {
  return {
    id: row.id,
    filePath: row.file_path,
    deletedAt: row.deleted_at,
  };
}

function deletedNoteToRow(deletedNote: DeletedNote): DeletedNoteRow {
  return {
    id: deletedNote.id,
    file_path: deletedNote.filePath,
    deleted_at: deletedNote.deletedAt,
  };
}

function standingMessageFromRow(row: StandingMessageRow): StandingMessage {
  return {
    id: row.id,
    text: row.text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function standingMessageToRow(message: StandingMessage): StandingMessageRow {
  return {
    id: message.id,
    text: message.text,
    created_at: message.createdAt,
    updated_at: message.updatedAt,
  };
}

async function readTable<T>(table: string, orderColumn: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*').order(orderColumn, {
    ascending: false,
  });

  if (error) throw error;
  return (data ?? []) as T[];
}

async function loadSupabaseSnapshot(): Promise<NotesState> {
  const [noteRows, checkInRows, deletedNoteRows, bucketPreferencesRows, standingMessageRows] =
    await Promise.all([
      readTable<NoteRow>('notes', 'created_at'),
      readTable<CheckInRow>('check_ins', 'created_at'),
      readTable<DeletedNoteRow>('deleted_notes', 'deleted_at'),
      supabase.from('bucket_preferences').select('*').eq('id', 'default').maybeSingle(),
      supabase.from('standing_messages').select('*').order('created_at', { ascending: true }),
    ]);

  if (bucketPreferencesRows.error) throw bucketPreferencesRows.error;
  if (standingMessageRows.error) throw standingMessageRows.error;

  const deletedNotes = deletedNoteRows.map(deletedNoteFromRow);
  const deletedIds = new Set(deletedNotes.map((deletedNote) => deletedNote.id));
  const notes = noteRows.map(noteFromRow).filter((note) => !deletedIds.has(note.id));
  const bucketPreferencesRow = bucketPreferencesRows.data as BucketPreferencesRow | null;

  return {
    recent: sortNewestFirst(notes.filter((note) => note.echo.state !== 'reviewed')),
    reviewed: sortNewestFirst(notes.filter((note) => note.echo.state === 'reviewed')),
    checkIns: sortNewestFirst(checkInRows.map(checkInFromRow)),
    deletedNotes,
    bucketPreferences: {
      customs: bucketPreferencesRow?.customs ?? [],
    },
    standingMessages: ((standingMessageRows.data ?? []) as StandingMessageRow[]).map(
      standingMessageFromRow
    ),
  };
}

async function upsertRows<T extends { id: string }>(table: string, rows: T[]): Promise<number> {
  if (rows.length === 0) return 0;

  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  return rows.length;
}

async function persistSupabaseSnapshot(state: NotesState, deviceId: string): Promise<number> {
  const notes = [...state.recent, ...state.reviewed];
  const deletedIds = state.deletedNotes.map((deletedNote) => deletedNote.id);
  let storedRows = 0;

  if (deletedIds.length > 0) {
    const { error } = await supabase.from('notes').delete().in('id', deletedIds);
    if (error) throw error;
  }

  storedRows += await upsertRows('notes', notes.map(noteToRow));
  storedRows += await upsertRows('check_ins', state.checkIns.map(checkInToRow));
  storedRows += await upsertRows('deleted_notes', state.deletedNotes.map(deletedNoteToRow));
  storedRows += await upsertRows(
    'standing_messages',
    state.standingMessages.map(standingMessageToRow)
  );

  const { error: bucketPreferencesError } = await supabase.from('bucket_preferences').upsert(
    {
      id: 'default',
      customs: state.bucketPreferences.customs,
    },
    { onConflict: 'id' }
  );
  if (bucketPreferencesError) throw bucketPreferencesError;
  storedRows += 1;

  const { error: deviceError } = await supabase.from('sync_devices').upsert(
    {
      id: deviceId,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (deviceError) throw deviceError;
  storedRows += 1;

  return storedRows;
}

export async function syncSupabaseSnapshot(
  state: NotesState,
  deviceId: string
): Promise<SyncOutput> {
  const remote = await loadSupabaseSnapshot();
  const mergedDeletedNotes = mergeDeletedNotes(state.deletedNotes, remote.deletedNotes);
  const mergedBucketPreferences = mergeBucketPreferences(
    state.bucketPreferences,
    remote.bucketPreferences
  );
  const deletedIds = new Set(mergedDeletedNotes.map((deletedNote) => deletedNote.id));
  const mergedNotes = mergeNotes([...state.recent, ...state.reviewed], [
    ...remote.recent,
    ...remote.reviewed,
  ]).filter((note) => !deletedIds.has(note.id));
  const mergedCheckIns = mergeCheckIns(state.checkIns, remote.checkIns);
  const mergedStandingMessages =
    state.standingMessages.length > 0 ? state.standingMessages : remote.standingMessages;

  const mergedState: NotesState = {
    recent: mergedNotes.filter((note) => note.echo.state !== 'reviewed'),
    reviewed: mergedNotes.filter((note) => note.echo.state === 'reviewed'),
    checkIns: mergedCheckIns,
    deletedNotes: mergedDeletedNotes,
    bucketPreferences: mergedBucketPreferences,
    standingMessages: mergedStandingMessages,
  };
  const storedRows = await persistSupabaseSnapshot(mergedState, deviceId);

  return {
    state: mergedState,
    summary: {
      pushedNotes: state.recent.length + state.reviewed.length,
      pushedCheckIns: state.checkIns.length,
      pulledNotes: remote.recent.length + remote.reviewed.length,
      pulledCheckIns: remote.checkIns.length,
      storedRows,
    },
  };
}
