import {
  DEFAULT_WIDGET_PREFERENCES,
  type Note,
  type NotesState,
  type WidgetEntry,
  type WidgetPreferences,
} from '@/lib/notes/types';

export type EchoWidgetProps = {
  entries: WidgetEntry[];
  updatedAt: string;
};

export const EMPTY_WIDGET_TEXT = 'Nothing needs your attention.';
export const PAUSED_WIDGET_TEXT = 'Echo widget is paused.';
export const WIDGET_TEXT_LIMIT = 180;
export const MAX_WIDGET_ENTRIES = 3;

const MAX_TIMELINE_UPDATES = 10;

type CreateWidgetEntriesOptions = {
  now?: Date | string;
  preferences?: WidgetPreferences;
};

type CreateEchoWidgetPropsOptions = CreateWidgetEntriesOptions & {
  updatedAt?: string;
};

export function compactWidgetText(text: string, limit = WIDGET_TEXT_LIMIT): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function noteWidgetText(note: Note): string {
  return compactWidgetText(note.widgetText ?? note.body);
}

function normalizeNow(value: Date | string | undefined): Date {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizePreferences(preferences?: WidgetPreferences): WidgetPreferences {
  return {
    ...DEFAULT_WIDGET_PREFERENCES,
    ...preferences,
  };
}

function echoDueTime(note: Note): number {
  const parsed = Date.parse(note.echo.nextDueAt);
  if (Number.isNaN(parsed)) return 0;
  return parsed;
}

function isEchoDue(note: Note, now: Date): boolean {
  return note.echo.enabled && echoDueTime(note) <= now.getTime();
}

function pausedEntry(): WidgetEntry[] {
  return [
    {
      id: 'paused',
      kind: 'empty',
      text: PAUSED_WIDGET_TEXT,
      targetUrl: null,
    },
  ];
}

function emptyEntry(): WidgetEntry[] {
  return [
    {
      id: 'empty',
      kind: 'empty',
      text: EMPTY_WIDGET_TEXT,
      targetUrl: null,
    },
  ];
}

export function createWidgetEntries(
  state: NotesState,
  options: CreateWidgetEntriesOptions = {}
): WidgetEntry[] {
  const now = normalizeNow(options.now);
  const preferences = normalizePreferences(options.preferences ?? state.widgetPreferences);
  if (!preferences.enabled) return pausedEntry();

  const dueEchoes = [...state.recent, ...state.reviewed]
    .filter((note) => isEchoDue(note, now))
    .sort((a, b) => echoDueTime(a) - echoDueTime(b))
    .slice(0, MAX_WIDGET_ENTRIES)
    .map<WidgetEntry>((note) => ({
      id: `echo-${note.id}`,
      kind: 'echo',
      text: noteWidgetText(note),
      targetUrl: `echo://note/${encodeURIComponent(note.id)}`,
      noteId: note.id,
    }));

  const standingSlots = Math.max(0, MAX_WIDGET_ENTRIES - dueEchoes.length);
  const standing = preferences.includeStandingMessages
    ? state.standingMessages.slice(0, standingSlots).map<WidgetEntry>((message) => ({
        id: `standing-${message.id}`,
        kind: 'standing',
        text: compactWidgetText(message.text),
        targetUrl: `echo://standing/${encodeURIComponent(message.id)}`,
        standingMessageId: message.id,
      }))
    : [];

  const entries = [...dueEchoes, ...standing];
  if (entries.length > 0) return entries;
  return emptyEntry();
}

export function createEchoWidgetProps(
  state: NotesState,
  options: CreateEchoWidgetPropsOptions = {}
): EchoWidgetProps {
  const updatedAt = options.updatedAt ?? new Date().toISOString();
  return {
    entries: createWidgetEntries(state, options),
    updatedAt,
  };
}

export function createEchoWidgetTimelineProps(
  state: NotesState,
  now = new Date()
): Array<{ date: Date; props: EchoWidgetProps }> {
  const currentDate = normalizeNow(now);
  const updatedAt = currentDate.toISOString();
  const futureDueDates = [...state.recent, ...state.reviewed]
    .filter((note) => note.echo.enabled)
    .map((note) => echoDueTime(note))
    .filter((timestamp) => timestamp > currentDate.getTime())
    .sort((a, b) => a - b);
  const uniqueFutureDueDates = [...new Set(futureDueDates)].slice(0, MAX_TIMELINE_UPDATES);

  return [
    {
      date: currentDate,
      props: createEchoWidgetProps(state, { now: currentDate, updatedAt }),
    },
    ...uniqueFutureDueDates.map((timestamp) => {
      const date = new Date(timestamp);
      return {
        date,
        props: createEchoWidgetProps(state, { now: date, updatedAt }),
      };
    }),
  ];
}
