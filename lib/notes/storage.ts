import * as FileSystem from 'expo-file-system/legacy';

import type { BucketName } from '@/constants/buckets';
import {
  CHECK_IN_EMOTIONS,
  DEFAULT_WIDGET_PREFERENCES,
  EMPTY_NOTES_STATE,
  type BucketDraft,
  type BucketPreferences,
  type CheckIn,
  type CheckInEmotion,
  type CheckInKind,
  type DeletedNote,
  type EchoSchedule,
  type Note,
  type NoteClassificationMethod,
  type NoteClassificationStatus,
  type NotesState,
  type StandingMessage,
  type WidgetPreferences,
} from '@/lib/notes/types';
import { normalizeEchoSchedule } from '@/lib/widgets/schedule';

const NOTES_STORAGE_FILE = `${FileSystem.documentDirectory ?? ''}echo-notes-v2.json`;
const LEGACY_NOTES_STORAGE_FILE = `${FileSystem.documentDirectory ?? ''}echo-notes-v1.json`;
const VAULT_ROOT = `${FileSystem.documentDirectory ?? ''}life-os`;
const ECHO_ROOT = `${VAULT_ROOT}/Echo`;
const NOTES_ROOT = `${ECHO_ROOT}/Notes`;
const CHECK_INS_ROOT = `${ECHO_ROOT}/Checkins`;
const SYSTEM_ROOT = `${ECHO_ROOT}/_system`;
const DELETED_NOTES_FILE = `${SYSTEM_ROOT}/deleted-notes.json`;
const BUCKET_PREFERENCES_FILE = `${SYSTEM_ROOT}/bucket-preferences.json`;
const STANDING_MESSAGES_FILE = `${SYSTEM_ROOT}/standing-messages.json`;

type FrontmatterValue = string | boolean | number | null | FrontmatterObject;
interface FrontmatterObject {
  [key: string]: FrontmatterValue;
}
type Frontmatter = Record<string, FrontmatterValue>;

function isBucketName(value: unknown): value is BucketName {
  return typeof value === 'string' && value.trim().length > 0;
}

function isClassificationStatus(value: unknown): value is NoteClassificationStatus {
  return value === 'pending' || value === 'classified' || value === 'failed';
}

function isClassificationMethod(value: unknown): value is NoteClassificationMethod {
  return value === 'ai' || value === 'keyword' || value === 'unknown';
}

function isCheckInKind(value: unknown): value is CheckInKind {
  return value === 'evening' || value === 'random';
}

function parseScalar(raw: string): FrontmatterValue {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && trimmed !== '') return numeric;
  return trimmed;
}

function normalizeMarkdownBody(body: string): string {
  return body.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd();
}

function parseFrontmatter(markdown: string): { frontmatter: Frontmatter; body: string } | null {
  if (!markdown.startsWith('---\n')) return null;

  const endIndex = markdown.indexOf('\n---', 4);
  if (endIndex === -1) return null;

  const rawFrontmatter = markdown.slice(4, endIndex).split('\n');
  const body = normalizeMarkdownBody(markdown.slice(endIndex + 4));
  const frontmatter: Frontmatter = {};
  let activeParent: string | null = null;

  for (const line of rawFrontmatter) {
    if (!line.trim()) continue;

    if (line.startsWith('  ') && activeParent) {
      const nested = line.trim();
      const separator = nested.indexOf(':');
      if (separator === -1) continue;

      const key = nested.slice(0, separator).trim();
      const value = parseScalar(nested.slice(separator + 1));
      const parent = frontmatter[activeParent];
      if (parent && typeof parent === 'object') {
        parent[key] = value;
      }
      continue;
    }

    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const valueRaw = line.slice(separator + 1);
    if (valueRaw.trim() === '') {
      frontmatter[key] = {};
      activeParent = key;
      continue;
    }

    frontmatter[key] = parseScalar(valueRaw);
    activeParent = null;
  }

  return { frontmatter, body };
}

function quoteYaml(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function formatYamlValue(value: string | boolean | number | null): string {
  if (value === null) return '';
  if (typeof value === 'string') return quoteYaml(value);
  return String(value);
}

function formatDatePath(createdAt: string): { year: string; month: string; date: string; time: string } {
  const date = new Date(createdAt);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const iso = safeDate.toISOString();
  return {
    year: iso.slice(0, 4),
    month: iso.slice(5, 7),
    date: iso.slice(0, 10),
    time: iso.slice(11, 16).replace(':', ''),
  };
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return slug || 'untitled';
}

function defaultEcho(createdAt: string): EchoSchedule {
  return normalizeEchoSchedule(null, createdAt, `legacy-${createdAt}`);
}

function getObject(value: FrontmatterValue | undefined): Record<string, FrontmatterValue> {
  if (value && typeof value === 'object') return value;
  return {};
}

function notePath(note: Note): string {
  if (note.filePath) return `${VAULT_ROOT}/${note.filePath}`;

  const { year, month, date, time } = formatDatePath(note.createdAt);
  return `${NOTES_ROOT}/${year}/${month}/${date}-${time}-${slugifyTitle(note.title)}.md`;
}

function checkInPath(checkIn: CheckIn): string {
  if (checkIn.filePath) return `${VAULT_ROOT}/${checkIn.filePath}`;

  const { year, month, date, time } = formatDatePath(checkIn.createdAt);
  return `${CHECK_INS_ROOT}/${year}/${month}/${date}-${time}-${checkIn.kind}.md`;
}

function relativeVaultPath(path: string): string {
  return path.startsWith(`${VAULT_ROOT}/`) ? path.slice(VAULT_ROOT.length + 1) : path;
}

function serializeNote(note: Note): string {
  return [
    '---',
    'schema: echo-note-v1',
    `id: ${note.id}`,
    `title: ${quoteYaml(note.title)}`,
    `created_at: ${note.createdAt}`,
    `updated_at: ${note.updatedAt}`,
    `bucket: ${note.bucket ? quoteYaml(note.bucket) : ''}`,
    `widget_text: ${formatYamlValue(note.widgetText)}`,
    'status: active',
    'source: mobile',
    'classification:',
    `  status: ${note.classificationStatus}`,
    `  method: ${note.classificationMethod}`,
    `  confidence: ${formatYamlValue(note.classificationConfidence)}`,
    'echo:',
    `  enabled: ${note.echo.enabled}`,
    `  state: ${note.echo.state}`,
    `  last_reviewed_at: ${formatYamlValue(note.echo.lastReviewedAt)}`,
    `  next_due_at: ${note.echo.nextDueAt}`,
    `  interval_days: ${note.echo.intervalDays}`,
    `  ease: ${note.echo.ease}`,
    `  occurrence_count: ${note.echo.occurrenceCount}`,
    `  scheduled_dates: ${quoteYaml(note.echo.scheduledDates.join(','))}`,
    '---',
    '',
    note.body,
    '',
  ].join('\n');
}

function serializeCheckIn(checkIn: CheckIn): string {
  return [
    '---',
    'schema: echo-checkin-v1',
    `id: ${checkIn.id}`,
    `created_at: ${checkIn.createdAt}`,
    `kind: ${checkIn.kind}`,
    `source: ${checkIn.source}`,
    `energy: ${checkIn.energy}`,
    'emotions:',
    ...CHECK_IN_EMOTIONS.map((emotion) => `  ${emotion}: ${checkIn.emotions[emotion]}`),
    '---',
    '',
    checkIn.body,
    '',
  ].join('\n');
}

function parseNoteFile(markdown: string, filePath: string): Note | null {
  const parsed = parseFrontmatter(markdown);
  if (!parsed) return null;

  const { frontmatter, body } = parsed;
  if (frontmatter.schema !== 'echo-note-v1') return null;
  if (
    typeof frontmatter.id !== 'string' ||
    typeof frontmatter.title !== 'string' ||
    typeof frontmatter.created_at !== 'string'
  ) {
    return null;
  }

  if (Array.isArray(frontmatter.bucket)) return null;
  const bucket = isBucketName(frontmatter.bucket) ? frontmatter.bucket : null;
  const classification = getObject(frontmatter.classification);
  const echo = getObject(frontmatter.echo);
  const classificationStatus = isClassificationStatus(classification.status)
    ? classification.status
    : bucket
      ? 'classified'
      : 'pending';
  const classificationMethod = isClassificationMethod(classification.method)
    ? classification.method
    : classificationStatus === 'classified'
      ? 'unknown'
      : 'unknown';

  return {
    id: frontmatter.id,
    title: frontmatter.title,
    body,
    createdAt: frontmatter.created_at,
    updatedAt:
      typeof frontmatter.updated_at === 'string' ? frontmatter.updated_at : frontmatter.created_at,
    bucket,
    classificationStatus,
    classificationMethod,
    classificationConfidence:
      typeof classification.confidence === 'number' ? classification.confidence : null,
    widgetText: typeof frontmatter.widget_text === 'string' ? frontmatter.widget_text : null,
    echo: normalizeEchoSchedule(
      {
        enabled: typeof echo.enabled === 'boolean' ? echo.enabled : true,
        state: echo.state === 'due' || echo.state === 'reviewed' ? echo.state : 'new',
        lastReviewedAt:
          typeof echo.last_reviewed_at === 'string' && echo.last_reviewed_at.length > 0
            ? echo.last_reviewed_at
            : null,
        nextDueAt:
          typeof echo.next_due_at === 'string'
            ? echo.next_due_at
            : defaultEcho(frontmatter.created_at).nextDueAt,
        intervalDays: typeof echo.interval_days === 'number' ? echo.interval_days : 1,
        ease: typeof echo.ease === 'number' ? echo.ease : 2.5,
        occurrenceCount: typeof echo.occurrence_count === 'number' ? echo.occurrence_count : 0,
        scheduledDates:
          typeof echo.scheduled_dates === 'string' && echo.scheduled_dates.length > 0
            ? echo.scheduled_dates.split(',').map((value) => value.trim()).filter(Boolean)
            : [],
      },
      frontmatter.created_at,
      frontmatter.id
    ),
    filePath: relativeVaultPath(filePath),
  };
}

function parseCheckInFile(markdown: string, filePath: string): CheckIn | null {
  const parsed = parseFrontmatter(markdown);
  if (!parsed) return null;

  const { frontmatter, body } = parsed;
  if (frontmatter.schema !== 'echo-checkin-v1') return null;
  if (
    typeof frontmatter.id !== 'string' ||
    typeof frontmatter.created_at !== 'string' ||
    typeof frontmatter.energy !== 'number' ||
    !isCheckInKind(frontmatter.kind)
  ) {
    return null;
  }

  const rawEmotions = getObject(frontmatter.emotions);
  const emotions = CHECK_IN_EMOTIONS.reduce(
    (result, emotion) => ({ ...result, [emotion]: rawEmotions[emotion] === true }),
    {} as Record<CheckInEmotion, boolean>
  );

  return {
    id: frontmatter.id,
    createdAt: frontmatter.created_at,
    kind: frontmatter.kind,
    source: frontmatter.source === 'obsidian' ? 'obsidian' : 'mobile',
    energy: Math.min(5, Math.max(1, Math.round(frontmatter.energy))),
    emotions,
    body,
    filePath: relativeVaultPath(filePath),
  };
}

async function ensureDirectory(path: string): Promise<void> {
  await FileSystem.makeDirectoryAsync(path, { intermediates: true });
}

async function fileExists(path: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(path);
  return info.exists;
}

async function readMarkdownFiles(root: string): Promise<{ path: string; markdown: string }[]> {
  if (!(await fileExists(root))) return [];

  const entries = await FileSystem.readDirectoryAsync(root);
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = `${root}/${entry}`;
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) return [];

      if (info.isDirectory) {
        return readMarkdownFiles(path);
      }

      if (!entry.endsWith('.md')) return [];
      return [{ path, markdown: await FileSystem.readAsStringAsync(path) }];
    })
  );

  return files.flat();
}

async function writeMarkdownFile(path: string, markdown: string): Promise<void> {
  const directory = path.slice(0, path.lastIndexOf('/'));
  await ensureDirectory(directory);
  await FileSystem.writeAsStringAsync(path, markdown);
}

async function writeSystemFiles(): Promise<void> {
  await ensureDirectory(SYSTEM_ROOT);
  const legacyBucketsFile = `${SYSTEM_ROOT}/buckets.yml`;
  if (await fileExists(legacyBucketsFile)) {
    await FileSystem.deleteAsync(legacyBucketsFile, { idempotent: true });
  }
  await FileSystem.writeAsStringAsync(
    `${SYSTEM_ROOT}/schema.md`,
    [
      '# Echo Schema',
      '',
      'Echo notes use `schema: echo-note-v1`, exactly one `bucket` string, and `classification.method` such as `ai` or `keyword`.',
      'Check-ins use `schema: echo-checkin-v1`, `energy` from 1-5, fixed emotion booleans, and the Markdown body for the daily recap.',
      '',
    ].join('\n')
  );
}

function normalizeDeletedNote(value: unknown): DeletedNote | null {
  if (!value || typeof value !== 'object') return null;

  const deletedNote = value as Partial<DeletedNote>;
  if (typeof deletedNote.id !== 'string' || typeof deletedNote.deletedAt !== 'string') {
    return null;
  }
  if (
    !(
      typeof deletedNote.filePath === 'string' ||
      deletedNote.filePath === null ||
      deletedNote.filePath === undefined
    )
  ) {
    return null;
  }

  return {
    id: deletedNote.id,
    filePath: deletedNote.filePath ?? null,
    deletedAt: deletedNote.deletedAt,
  };
}

async function loadDeletedNotes(): Promise<DeletedNote[]> {
  if (!(await fileExists(DELETED_NOTES_FILE))) return [];

  try {
    const raw = await FileSystem.readAsStringAsync(DELETED_NOTES_FILE);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeDeletedNote)
      .filter((deletedNote): deletedNote is DeletedNote => deletedNote !== null)
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  } catch {
    return [];
  }
}

function normalizeBucketDraft(value: unknown): BucketDraft | null {
  if (!value || typeof value !== 'object') return null;
  const bucketDraft = value as Partial<BucketDraft>;
  if (
    typeof bucketDraft.name !== 'string' ||
    typeof bucketDraft.description !== 'string' ||
    typeof bucketDraft.colorKey !== 'string'
  ) {
    return null;
  }

  return {
    name: bucketDraft.name.trim(),
    description: bucketDraft.description.trim(),
    colorKey: bucketDraft.colorKey.trim(),
  };
}

function dedupeBucketDrafts(drafts: BucketDraft[]): BucketDraft[] {
  const seen = new Set<string>();
  const result: BucketDraft[] = [];

  drafts.forEach((draft) => {
    const key = draft.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(draft);
  });

  return result;
}

async function loadBucketPreferences(): Promise<BucketPreferences> {
  if (!(await fileExists(BUCKET_PREFERENCES_FILE))) {
    return EMPTY_NOTES_STATE.bucketPreferences;
  }

  try {
    const raw = await FileSystem.readAsStringAsync(BUCKET_PREFERENCES_FILE);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return EMPTY_NOTES_STATE.bucketPreferences;
    }

    const customsInput =
      'customs' in parsed && Array.isArray(parsed.customs) ? parsed.customs : [];
    const legacyBuiltinsInput =
      'builtins' in parsed && parsed.builtins && typeof parsed.builtins === 'object'
        ? Object.values(parsed.builtins as Record<string, unknown>)
        : [];

    return {
      customs: dedupeBucketDrafts(
        [...customsInput, ...legacyBuiltinsInput]
          .map(normalizeBucketDraft)
          .filter((bucketDraft): bucketDraft is BucketDraft => bucketDraft !== null)
      ),
    };
  } catch {
    return EMPTY_NOTES_STATE.bucketPreferences;
  }
}

function normalizeStandingMessage(value: unknown): StandingMessage | null {
  if (!value || typeof value !== 'object') return null;
  const standingMessage = value as Partial<StandingMessage>;
  if (
    typeof standingMessage.id !== 'string' ||
    typeof standingMessage.text !== 'string' ||
    typeof standingMessage.createdAt !== 'string' ||
    typeof standingMessage.updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    id: standingMessage.id,
    text: standingMessage.text,
    createdAt: standingMessage.createdAt,
    updatedAt: standingMessage.updatedAt,
  };
}

function normalizeWidgetPreferences(value: unknown): WidgetPreferences {
  if (!value || typeof value !== 'object') return DEFAULT_WIDGET_PREFERENCES;
  const preferences = value as Partial<WidgetPreferences>;

  return {
    enabled:
      typeof preferences.enabled === 'boolean'
        ? preferences.enabled
        : DEFAULT_WIDGET_PREFERENCES.enabled,
    includeStandingMessages:
      typeof preferences.includeStandingMessages === 'boolean'
        ? preferences.includeStandingMessages
        : DEFAULT_WIDGET_PREFERENCES.includeStandingMessages,
  };
}

async function loadStandingMessages(): Promise<StandingMessage[]> {
  if (!(await fileExists(STANDING_MESSAGES_FILE))) return [];

  try {
    const raw = await FileSystem.readAsStringAsync(STANDING_MESSAGES_FILE);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeStandingMessage)
      .filter((message): message is StandingMessage => message !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

function sortNewestFirst<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function loadLegacyState(): Promise<NotesState> {
  if (!LEGACY_NOTES_STORAGE_FILE || !(await fileExists(LEGACY_NOTES_STORAGE_FILE))) {
    return EMPTY_NOTES_STATE;
  }

  try {
    const raw = await FileSystem.readAsStringAsync(LEGACY_NOTES_STORAGE_FILE);
    const parsed = JSON.parse(raw) as Partial<NotesState>;
    const normalizeNote = (value: unknown): Note | null => {
      if (!value || typeof value !== 'object') return null;
      const note = value as Partial<Note>;
      if (
        typeof note.id !== 'string' ||
        typeof note.title !== 'string' ||
        typeof note.body !== 'string' ||
        typeof note.createdAt !== 'string'
      ) {
        return null;
      }
      if (!(note.bucket === null || isBucketName(note.bucket))) return null;
      if (!isClassificationStatus(note.classificationStatus)) return null;

      return {
        id: note.id,
        title: note.title,
        body: note.body,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt ?? note.createdAt,
        bucket: note.bucket,
        classificationStatus: note.classificationStatus,
        classificationMethod: note.classificationMethod ?? 'unknown',
        classificationConfidence: null,
        widgetText: typeof note.widgetText === 'string' ? note.widgetText : null,
        echo: note.echo ?? defaultEcho(note.createdAt),
        filePath: null,
      };
    };

    const recent = Array.isArray(parsed.recent)
      ? parsed.recent.map(normalizeNote).filter((note): note is Note => note !== null)
      : [];
    const reviewed = Array.isArray(parsed.reviewed)
      ? parsed.reviewed.map(normalizeNote).filter((note): note is Note => note !== null)
      : [];

    return {
      recent,
      reviewed,
      checkIns: [],
      deletedNotes: [],
      bucketPreferences: EMPTY_NOTES_STATE.bucketPreferences,
      standingMessages: [],
      widgetPreferences: EMPTY_NOTES_STATE.widgetPreferences,
    };
  } catch {
    return EMPTY_NOTES_STATE;
  }
}

function normalizeNote(value: unknown): Note | null {
  if (!value || typeof value !== 'object') return null;
  const note = value as Partial<Note>;
  if (
    typeof note.id !== 'string' ||
    typeof note.title !== 'string' ||
    typeof note.body !== 'string' ||
    typeof note.createdAt !== 'string'
  ) {
    return null;
  }
  if (!(note.bucket === null || note.bucket === undefined || isBucketName(note.bucket))) return null;
  if (!isClassificationStatus(note.classificationStatus)) return null;

  return {
    id: note.id,
    title: note.title,
    body: note.body,
    createdAt: note.createdAt,
    updatedAt: typeof note.updatedAt === 'string' ? note.updatedAt : note.createdAt,
    bucket: note.bucket ?? null,
    classificationStatus: note.classificationStatus,
    classificationMethod: isClassificationMethod(note.classificationMethod)
      ? note.classificationMethod
      : 'unknown',
    classificationConfidence:
      typeof note.classificationConfidence === 'number' ? note.classificationConfidence : null,
    widgetText: typeof note.widgetText === 'string' ? note.widgetText : null,
    echo: normalizeEchoSchedule(note.echo ?? null, note.createdAt, note.id),
    filePath: typeof note.filePath === 'string' ? note.filePath : null,
  };
}

function normalizeCheckIn(value: unknown): CheckIn | null {
  if (!value || typeof value !== 'object') return null;
  const checkIn = value as Partial<CheckIn>;
  if (
    typeof checkIn.id !== 'string' ||
    typeof checkIn.createdAt !== 'string' ||
    !isCheckInKind(checkIn.kind) ||
    typeof checkIn.energy !== 'number' ||
    typeof checkIn.body !== 'string'
  ) {
    return null;
  }

  const rawEmotions =
    checkIn.emotions && typeof checkIn.emotions === 'object'
      ? (checkIn.emotions as Partial<Record<CheckInEmotion, boolean>>)
      : {};
  const emotions = CHECK_IN_EMOTIONS.reduce(
    (result, emotion) => ({ ...result, [emotion]: rawEmotions[emotion] === true }),
    {} as Record<CheckInEmotion, boolean>
  );

  return {
    id: checkIn.id,
    createdAt: checkIn.createdAt,
    kind: checkIn.kind,
    source: checkIn.source === 'obsidian' ? 'obsidian' : 'mobile',
    energy: Math.min(5, Math.max(1, Math.round(checkIn.energy))),
    emotions,
    body: checkIn.body,
    filePath: typeof checkIn.filePath === 'string' ? checkIn.filePath : null,
  };
}

function normalizeNotesState(value: unknown): NotesState {
  if (!value || typeof value !== 'object') return EMPTY_NOTES_STATE;
  const parsed = value as Partial<NotesState>;
  const legacyBucketPreferences = parsed.bucketPreferences as
    | { customs?: unknown; builtins?: unknown }
    | undefined;

  const deletedNotes = Array.isArray(parsed.deletedNotes)
    ? parsed.deletedNotes
        .map(normalizeDeletedNote)
        .filter((deletedNote): deletedNote is DeletedNote => deletedNote !== null)
    : [];
  const deletedIds = new Set(deletedNotes.map((deletedNote) => deletedNote.id));
  const recent = Array.isArray(parsed.recent)
    ? parsed.recent
        .map(normalizeNote)
        .filter((note): note is Note => note !== null && !deletedIds.has(note.id))
    : [];
  const reviewed = Array.isArray(parsed.reviewed)
    ? parsed.reviewed
        .map(normalizeNote)
        .filter((note): note is Note => note !== null && !deletedIds.has(note.id))
    : [];
  const checkIns = Array.isArray(parsed.checkIns)
    ? parsed.checkIns
        .map(normalizeCheckIn)
        .filter((checkIn): checkIn is CheckIn => checkIn !== null)
    : [];

  return {
    recent: sortNewestFirst(recent),
    reviewed: sortNewestFirst(reviewed),
    checkIns: sortNewestFirst(checkIns),
    deletedNotes: deletedNotes.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)),
    bucketPreferences: legacyBucketPreferences
      ? {
          customs: dedupeBucketDrafts(
            [
              ...(Array.isArray(legacyBucketPreferences.customs)
                ? legacyBucketPreferences.customs
                : []),
              ...(legacyBucketPreferences.builtins &&
              typeof legacyBucketPreferences.builtins === 'object'
                ? Object.values(legacyBucketPreferences.builtins)
                : []),
            ]
              .map(normalizeBucketDraft)
              .filter((draft): draft is BucketDraft => draft !== null)
          ),
        }
      : EMPTY_NOTES_STATE.bucketPreferences,
    standingMessages: Array.isArray(parsed.standingMessages)
      ? parsed.standingMessages
          .map(normalizeStandingMessage)
          .filter((message): message is StandingMessage => message !== null)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      : [],
    widgetPreferences: normalizeWidgetPreferences(parsed.widgetPreferences),
  };
}

async function loadJsonState(): Promise<NotesState | null> {
  if (!NOTES_STORAGE_FILE || !(await fileExists(NOTES_STORAGE_FILE))) return null;

  try {
    const raw = await FileSystem.readAsStringAsync(NOTES_STORAGE_FILE);
    return normalizeNotesState(JSON.parse(raw) as unknown);
  } catch {
    return EMPTY_NOTES_STATE;
  }
}

export async function loadNotesState(): Promise<NotesState> {
  const jsonState = await loadJsonState();
  if (jsonState) return jsonState;

  if (!VAULT_ROOT) return EMPTY_NOTES_STATE;

  try {
    await ensureDirectory(VAULT_ROOT);
    await writeSystemFiles();

    const noteFiles = await readMarkdownFiles(NOTES_ROOT);
    const checkInFiles = await readMarkdownFiles(CHECK_INS_ROOT);
    const deletedNotes = await loadDeletedNotes();
    const bucketPreferences = await loadBucketPreferences();
    const standingMessages = await loadStandingMessages();
    const deletedIds = new Set(deletedNotes.map((deletedNote) => deletedNote.id));
    const notes = noteFiles
      .map((file) => parseNoteFile(file.markdown, file.path))
      .filter((note): note is Note => note !== null && !deletedIds.has(note.id));
    const checkIns = checkInFiles
      .map((file) => parseCheckInFile(file.markdown, file.path))
      .filter((checkIn): checkIn is CheckIn => checkIn !== null);

    if (
      notes.length > 0 ||
      checkIns.length > 0 ||
      deletedNotes.length > 0 ||
      bucketPreferences.customs.length > 0 ||
      standingMessages.length > 0
    ) {
      return {
        recent: sortNewestFirst(notes.filter((note) => note.echo.state !== 'reviewed')),
        reviewed: sortNewestFirst(notes.filter((note) => note.echo.state === 'reviewed')),
        checkIns: sortNewestFirst(checkIns),
        deletedNotes,
        bucketPreferences,
        standingMessages,
        widgetPreferences: EMPTY_NOTES_STATE.widgetPreferences,
      };
    }

    const legacyState = await loadLegacyState();
    if (legacyState.recent.length > 0 || legacyState.reviewed.length > 0) {
      await saveNotesState(legacyState);
    }
    return legacyState;
  } catch {
    return EMPTY_NOTES_STATE;
  }
}

export async function saveNotesState(state: NotesState): Promise<void> {
  if (!NOTES_STORAGE_FILE) return;

  try {
    await FileSystem.writeAsStringAsync(NOTES_STORAGE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Keep in-memory state as source-of-truth even when persistence fails.
  }
}

export async function clearNotesState(): Promise<void> {
  if (!VAULT_ROOT) return;

  try {
    if (await fileExists(VAULT_ROOT)) {
      await FileSystem.deleteAsync(VAULT_ROOT, { idempotent: true });
    }
    if (await fileExists(NOTES_STORAGE_FILE)) {
      await FileSystem.deleteAsync(NOTES_STORAGE_FILE, { idempotent: true });
    }
    if (await fileExists(LEGACY_NOTES_STORAGE_FILE)) {
      await FileSystem.deleteAsync(LEGACY_NOTES_STORAGE_FILE, { idempotent: true });
    }
  } catch {
    // No-op when cleanup fails.
  }
}

export function createNoteFilePath(_note: Note): string | null {
  return null;
}

export function createCheckInFilePath(_checkIn: CheckIn): string | null {
  return null;
}

export async function deleteVaultFile(_filePath: string | null): Promise<void> {
  return;
}
