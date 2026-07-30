import type { CheckIn, DeletedNote, Note, NotesState } from '@/lib/notes/types';

export type EchoSyncConfig = {
  apiBaseUrl: string | null;
  apiToken: string | null;
  deviceId: string;
  syncEnabled: boolean;
  aiCategorizationEnabled: boolean;
};

export type RemoteNoteClassification = {
  title: string;
  bucket: string;
  confidence: number | null;
  method: 'ai';
  model: string | null;
};

export type RemoteWidgetShortening = {
  widgetText: string;
  model: string | null;
};

export type SyncStatus = {
  isSyncing: boolean;
  configured: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  pendingReason: string | null;
};

export type SyncSnapshot = {
  notes: Note[];
  checkIns: CheckIn[];
  deletedNotes: DeletedNote[];
  bucketPreferences: NotesState['bucketPreferences'];
  standingMessages: NotesState['standingMessages'];
};

export type SyncResult = {
  state: NotesState;
  syncedAt: string;
  summary: {
    pushedNotes: number;
    pushedCheckIns: number;
    pulledNotes: number;
    pulledCheckIns: number;
  };
};
