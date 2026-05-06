import type { Note, NotesState, WidgetEntry } from '@/lib/notes/types';
import { todayKey } from '@/lib/widgets/schedule';

export type EchoWidgetProps = {
  entries: WidgetEntry[];
  updatedAt: string;
};

export const EMPTY_WIDGET_TEXT = 'Nothing needs your attention.';
export const WIDGET_TEXT_LIMIT = 180;

export function compactWidgetText(text: string, limit = WIDGET_TEXT_LIMIT): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function noteWidgetText(note: Note): string {
  return compactWidgetText(note.widgetText ?? note.body);
}

export function createWidgetEntries(state: NotesState, date = todayKey()): WidgetEntry[] {
  const dueEchoes = [...state.recent, ...state.reviewed]
    .filter((note) => note.echo.enabled && note.echo.scheduledDates.includes(date))
    .sort((a, b) => a.echo.scheduledDates.indexOf(date) - b.echo.scheduledDates.indexOf(date))
    .slice(0, 3)
    .map<WidgetEntry>((note) => ({
      id: `echo-${note.id}`,
      kind: 'echo',
      text: noteWidgetText(note),
      targetUrl: `echo://note/${encodeURIComponent(note.id)}`,
      noteId: note.id,
    }));

  const standingSlots = Math.max(0, 3 - dueEchoes.length);
  const standing = state.standingMessages.slice(0, standingSlots).map<WidgetEntry>((message) => ({
    id: `standing-${message.id}`,
    kind: 'standing',
    text: compactWidgetText(message.text),
    targetUrl: `echo://standing/${encodeURIComponent(message.id)}`,
    standingMessageId: message.id,
  }));

  const entries = [...dueEchoes, ...standing];
  if (entries.length > 0) return entries;

  return [
    {
      id: 'empty',
      kind: 'empty',
      text: EMPTY_WIDGET_TEXT,
      targetUrl: null,
    },
  ];
}

export function createEchoWidgetProps(state: NotesState): EchoWidgetProps {
  return {
    entries: createWidgetEntries(state),
    updatedAt: new Date().toISOString(),
  };
}

