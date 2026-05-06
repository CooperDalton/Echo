import type { BucketName } from '@/constants/buckets';
import type { CheckIn, DeletedNote, Note, NotesState } from '@/lib/notes/types';
import type {
  EchoSyncConfig,
  RemoteNoteClassification,
  RemoteWidgetShortening,
  SyncResult,
} from '@/lib/sync/types';

type SyncRequestBody = {
  deviceId: string;
  repo: {
    owner: string;
    name: string;
    branch: string;
  };
  snapshot: {
    notes: Note[];
    checkIns: CheckIn[];
    deletedNotes: DeletedNote[];
    bucketPreferences: NotesState['bucketPreferences'];
    standingMessages: NotesState['standingMessages'];
  };
};

type SyncResponseBody = {
  notes?: Note[];
  checkIns?: CheckIn[];
  deletedNotes?: DeletedNote[];
  bucketPreferences?: NotesState['bucketPreferences'];
  standingMessages?: NotesState['standingMessages'];
  syncedAt?: string;
  summary?: {
    pushedNotes?: number;
    pushedCheckIns?: number;
    pulledNotes?: number;
    pulledCheckIns?: number;
  };
};

type ClassifyResponseBody = {
  title?: string;
  bucket?: BucketName;
  confidence?: number | null;
  method?: 'ai';
  model?: string | null;
};

type ClassifyRequestBody = {
  note: Pick<Note, 'id' | 'title' | 'body' | 'createdAt' | 'updatedAt'>;
  repo?: {
    owner?: string | null;
    name?: string | null;
    branch?: string | null;
  };
};

type ShortenWidgetNoteResponseBody = {
  widgetText?: string;
  model?: string | null;
};

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

async function postJson<TResponse>(url: string, body: unknown): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

export async function syncVaultSnapshot(
  config: EchoSyncConfig,
  state: NotesState
): Promise<SyncResult> {
  if (!config.apiBaseUrl || !config.repoOwner || !config.repoName) {
    throw new Error('Sync is not configured.');
  }

  const url = `${normalizeBaseUrl(config.apiBaseUrl)}/api/mobile/sync`;
  const payload: SyncRequestBody = {
    deviceId: config.deviceId,
    repo: {
      owner: config.repoOwner,
      name: config.repoName,
      branch: config.repoBranch,
    },
    snapshot: {
      notes: [...state.recent, ...state.reviewed],
      checkIns: state.checkIns,
      deletedNotes: state.deletedNotes,
      bucketPreferences: state.bucketPreferences,
      standingMessages: state.standingMessages,
    },
  };

  const response = await postJson<SyncResponseBody>(url, payload);

  return {
    state: {
      recent: (response.notes ?? []).filter((note) => note.echo.state !== 'reviewed'),
      reviewed: (response.notes ?? []).filter((note) => note.echo.state === 'reviewed'),
      checkIns: response.checkIns ?? [],
      deletedNotes: response.deletedNotes ?? payload.snapshot.deletedNotes,
      bucketPreferences: response.bucketPreferences ?? payload.snapshot.bucketPreferences,
      standingMessages: response.standingMessages ?? payload.snapshot.standingMessages,
    },
    syncedAt: response.syncedAt ?? new Date().toISOString(),
    summary: {
      pushedNotes: response.summary?.pushedNotes ?? payload.snapshot.notes.length,
      pushedCheckIns: response.summary?.pushedCheckIns ?? payload.snapshot.checkIns.length,
      pulledNotes: response.summary?.pulledNotes ?? response.notes?.length ?? 0,
      pulledCheckIns: response.summary?.pulledCheckIns ?? response.checkIns?.length ?? 0,
    },
  };
}

export async function shortenWidgetNoteRemotely(
  config: EchoSyncConfig,
  note: Pick<Note, 'id' | 'title' | 'body'>,
  maxLength: number
): Promise<RemoteWidgetShortening | null> {
  if (!config.apiBaseUrl || !config.aiCategorizationEnabled) return null;

  const url = `${normalizeBaseUrl(config.apiBaseUrl)}/api/mobile/shorten-widget-note`;
  const response = await postJson<ShortenWidgetNoteResponseBody>(url, {
    note,
    maxLength,
  });

  if (typeof response.widgetText !== 'string' || response.widgetText.trim().length === 0) {
    return null;
  }

  return {
    widgetText: response.widgetText.trim(),
    model: typeof response.model === 'string' ? response.model : null,
  };
}

export async function classifyNoteRemotely(
  config: EchoSyncConfig,
  note: Pick<Note, 'id' | 'title' | 'body' | 'createdAt' | 'updatedAt'>
): Promise<RemoteNoteClassification | null> {
  if (!config.apiBaseUrl || !config.aiCategorizationEnabled) return null;

  const url = `${normalizeBaseUrl(config.apiBaseUrl)}/api/mobile/classify-note`;
  const requestBody: ClassifyRequestBody = {
    note,
  };

  if (config.repoOwner || config.repoName) {
    requestBody.repo = {
      owner: config.repoOwner,
      name: config.repoName,
      branch: config.repoBranch,
    };
  }

  const response = await postJson<ClassifyResponseBody>(url, requestBody);

  if (!response.bucket) return null;
  if (typeof response.title !== 'string' || response.title.trim().length === 0) return null;

  return {
    title: response.title.trim(),
    bucket: response.bucket,
    confidence: typeof response.confidence === 'number' ? response.confidence : null,
    method: 'ai',
    model: typeof response.model === 'string' ? response.model : null,
  };
}
