import {
  BUCKETS,
  type BucketDraft,
  type BucketPreferences,
  CHECK_IN_EMOTIONS,
  type BucketName,
  type CheckIn,
  type CheckInEmotion,
  type CheckInKind,
  type DeletedNote,
  type EchoSchedule,
  type Note,
  type NoteClassificationMethod,
  type NoteClassificationStatus,
  type StandingMessage,
} from './contracts';

type FrontmatterValue = string | boolean | number | null | FrontmatterObject;
type Frontmatter = Record<string, FrontmatterValue>;

interface FrontmatterObject {
  [key: string]: FrontmatterValue;
}

const NOTES_ROOT = 'Echo/Notes';
const CHECKINS_ROOT = 'Echo/Checkins';
const SYSTEM_ROOT = 'Echo/_system';
export const DELETED_NOTES_PATH = `${SYSTEM_ROOT}/deleted-notes.json`;
export const BUCKET_PREFERENCES_PATH = `${SYSTEM_ROOT}/bucket-preferences.json`;
export const STANDING_MESSAGES_PATH = `${SYSTEM_ROOT}/standing-messages.json`;

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

function getObject(value: FrontmatterValue | undefined): Record<string, FrontmatterValue> {
  if (value && typeof value === 'object') return value;
  return {};
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
    occurrenceCount: 0,
    scheduledDates: [nextDue.toISOString().slice(0, 10)],
  };
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

export function notePath(note: Note): string {
  if (note.filePath) return note.filePath;
  const { year, month, date, time } = formatDatePath(note.createdAt);
  return `${NOTES_ROOT}/${year}/${month}/${date}-${time}-${slugifyTitle(note.title)}.md`;
}

export function checkInPath(checkIn: CheckIn): string {
  if (checkIn.filePath) return checkIn.filePath;
  const { year, month, date, time } = formatDatePath(checkIn.createdAt);
  return `${CHECKINS_ROOT}/${year}/${month}/${date}-${time}-${checkIn.kind}.md`;
}

export function serializeNote(note: Note): string {
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

export function serializeCheckIn(checkIn: CheckIn): string {
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

export function parseNoteFile(markdown: string, filePath: string): Note | null {
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
      occurrenceCount: typeof echo.occurrence_count === 'number' ? echo.occurrence_count : 0,
      scheduledDates:
        typeof echo.scheduled_dates === 'string' && echo.scheduled_dates.length > 0
          ? echo.scheduled_dates.split(',').map((value) => value.trim()).filter(Boolean)
          : [defaultEcho(frontmatter.created_at).nextDueAt.slice(0, 10)],
    },
    filePath,
  };
}

export function parseCheckInFile(markdown: string, filePath: string): CheckIn | null {
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
    filePath,
  };
}

export function systemFiles(): Record<string, string> {
  return {
    [`${SYSTEM_ROOT}/buckets.yml`]: [
      'buckets:',
      ...BUCKETS.map((bucket) => `  - ${quoteYaml(bucket)}`),
      '',
    ].join('\n'),
    [`${SYSTEM_ROOT}/schema.md`]: [
      '# Echo Schema',
      '',
      'Echo notes use `schema: echo-note-v1`, exactly one `bucket` string, and `classification.method` values produced by the backend.',
      'Check-ins use `schema: echo-checkin-v1`, `energy` from 1-5, fixed emotion booleans, and the Markdown body for the daily recap.',
      '',
    ].join('\n'),
  };
}

function isBucketDraft(value: unknown): value is BucketDraft {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as BucketDraft).name === 'string' &&
      typeof (value as BucketDraft).description === 'string' &&
      typeof (value as BucketDraft).colorKey === 'string'
  );
}

export function serializeBucketPreferences(bucketPreferences: BucketPreferences): string {
  return JSON.stringify(bucketPreferences, null, 2);
}

export function parseBucketPreferences(raw: string): BucketPreferences {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { builtins: {}, customs: [] };
    }

    const builtinsInput =
      'builtins' in parsed && parsed.builtins && typeof parsed.builtins === 'object'
        ? (parsed.builtins as Record<string, unknown>)
        : {};
    const customsInput =
      'customs' in parsed && Array.isArray(parsed.customs) ? parsed.customs : [];

    const builtins = BUCKETS.reduce<BucketPreferences['builtins']>((result, bucket) => {
      const nextDraft = builtinsInput[bucket];
      if (!isBucketDraft(nextDraft)) return result;
      return { ...result, [bucket]: nextDraft };
    }, {});

    return {
      builtins,
      customs: customsInput.filter(isBucketDraft),
    };
  } catch {
    return { builtins: {}, customs: [] };
  }
}

export function serializeDeletedNotes(deletedNotes: DeletedNote[]): string {
  return JSON.stringify(deletedNotes, null, 2);
}

export function parseDeletedNotes(raw: string): DeletedNote[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (entry): entry is DeletedNote =>
          Boolean(
            entry &&
              typeof entry === 'object' &&
              typeof (entry as DeletedNote).id === 'string' &&
              typeof (entry as DeletedNote).deletedAt === 'string' &&
              (typeof (entry as DeletedNote).filePath === 'string' ||
                (entry as DeletedNote).filePath === null)
          )
      )
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  } catch {
    return [];
  }
}

export function serializeStandingMessages(messages: StandingMessage[]): string {
  return JSON.stringify(messages, null, 2);
}

export function parseStandingMessages(raw: string): StandingMessage[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is StandingMessage =>
        Boolean(
          entry &&
            typeof entry === 'object' &&
            typeof (entry as StandingMessage).id === 'string' &&
            typeof (entry as StandingMessage).text === 'string' &&
            typeof (entry as StandingMessage).createdAt === 'string' &&
            typeof (entry as StandingMessage).updatedAt === 'string'
        )
    );
  } catch {
    return [];
  }
}
