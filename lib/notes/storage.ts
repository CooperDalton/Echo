import * as FileSystem from 'expo-file-system/legacy';

import { BUCKETS, type BucketName } from '@/constants/buckets';
import {
  CHECK_IN_EMOTIONS,
  EMPTY_NOTES_STATE,
  type CheckIn,
  type CheckInEmotion,
  type CheckInKind,
  type EchoSchedule,
  type Note,
  type NoteClassificationMethod,
  type NoteClassificationStatus,
  type NotesState,
} from '@/lib/notes/types';

const LEGACY_NOTES_STORAGE_FILE = `${FileSystem.documentDirectory ?? ''}echo-notes-v1.json`;
const VAULT_ROOT = `${FileSystem.documentDirectory ?? ''}life-os`;
const ECHO_ROOT = `${VAULT_ROOT}/Echo`;
const NOTES_ROOT = `${ECHO_ROOT}/Notes`;
const CHECK_INS_ROOT = `${ECHO_ROOT}/Checkins`;
const SYSTEM_ROOT = `${ECHO_ROOT}/_system`;

type FrontmatterValue = string | boolean | number | null | FrontmatterObject;
interface FrontmatterObject {
  [key: string]: FrontmatterValue;
}
type Frontmatter = Record<string, FrontmatterValue>;

function isBucketName(value: unknown): value is BucketName {
  return typeof value === 'string' && BUCKETS.includes(value as BucketName);
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

function parseFrontmatter(markdown: string): { frontmatter: Frontmatter; body: string } | null {
  if (!markdown.startsWith('---\n')) return null;

  const endIndex = markdown.indexOf('\n---', 4);
  if (endIndex === -1) return null;

  const rawFrontmatter = markdown.slice(4, endIndex).split('\n');
  const body = markdown.slice(endIndex + 4).replace(/^\n/, '');
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

  return { frontmatter, body: body.trimEnd() };
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
  const nextDue = new Date(createdAt);
  if (Number.isNaN(nextDue.getTime())) {
    nextDue.setTime(Date.now());
  }
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
    echo: {
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
    },
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
  await FileSystem.writeAsStringAsync(
    `${SYSTEM_ROOT}/buckets.yml`,
    ['buckets:', ...BUCKETS.map((bucket) => `  - ${quoteYaml(bucket)}`), ''].join('\n')
  );
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

    return { recent, reviewed, checkIns: [] };
  } catch {
    return EMPTY_NOTES_STATE;
  }
}

export async function loadNotesState(): Promise<NotesState> {
  if (!VAULT_ROOT) return EMPTY_NOTES_STATE;

  try {
    await ensureDirectory(VAULT_ROOT);
    await writeSystemFiles();

    const noteFiles = await readMarkdownFiles(NOTES_ROOT);
    const checkInFiles = await readMarkdownFiles(CHECK_INS_ROOT);
    const notes = noteFiles
      .map((file) => parseNoteFile(file.markdown, file.path))
      .filter((note): note is Note => note !== null);
    const checkIns = checkInFiles
      .map((file) => parseCheckInFile(file.markdown, file.path))
      .filter((checkIn): checkIn is CheckIn => checkIn !== null);

    if (notes.length > 0 || checkIns.length > 0) {
      return {
        recent: sortNewestFirst(notes.filter((note) => note.echo.state !== 'reviewed')),
        reviewed: sortNewestFirst(notes.filter((note) => note.echo.state === 'reviewed')),
        checkIns: sortNewestFirst(checkIns),
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
  if (!VAULT_ROOT) return;

  try {
    await ensureDirectory(VAULT_ROOT);
    await writeSystemFiles();

    await Promise.all(
      [...state.recent, ...state.reviewed].map(async (note) => {
        const path = notePath(note);
        await writeMarkdownFile(path, serializeNote({ ...note, filePath: relativeVaultPath(path) }));
      })
    );

    await Promise.all(
      state.checkIns.map(async (checkIn) => {
        const path = checkInPath(checkIn);
        await writeMarkdownFile(path, serializeCheckIn({ ...checkIn, filePath: relativeVaultPath(path) }));
      })
    );
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
    if (await fileExists(LEGACY_NOTES_STORAGE_FILE)) {
      await FileSystem.deleteAsync(LEGACY_NOTES_STORAGE_FILE, { idempotent: true });
    }
  } catch {
    // No-op when cleanup fails.
  }
}

export function createNoteFilePath(note: Note): string {
  return relativeVaultPath(notePath(note));
}

export function createCheckInFilePath(checkIn: CheckIn): string {
  return relativeVaultPath(checkInPath(checkIn));
}

export async function deleteVaultFile(filePath: string | null): Promise<void> {
  if (!filePath) return;

  try {
    const path = filePath.startsWith(VAULT_ROOT) ? filePath : `${VAULT_ROOT}/${filePath}`;
    if (await fileExists(path)) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
  } catch {
    // No-op when file cleanup fails.
  }
}
