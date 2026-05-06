import type { EchoSchedule, Note } from '@/lib/notes/types';

const ECHO_INTERVAL_RANGES: Array<[number, number]> = [
  [4, 9],
  [12, 18],
  [30, 45],
  [60, 90],
  [120, 180],
];

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfLocalDay(value: string | Date): Date {
  const date = typeof value === 'string' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return startOfLocalDay(new Date());
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRatio(seed: number, index: number): number {
  let value = seed + Math.imul(index + 1, 0x9e3779b1);
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4294967295;
}

function intervalForRange(seed: number, index: number, range: [number, number]): number {
  const [min, max] = range;
  return min + Math.floor(seededRatio(seed, index) * (max - min + 1));
}

function occupancyFromNotes(notes: Note[], ignoredNoteId?: string): Map<string, number> {
  const map = new Map<string, number>();
  notes.forEach((note) => {
    if (note.id === ignoredNoteId || !note.echo.enabled) return;
    note.echo.scheduledDates.forEach((scheduledDate) => {
      map.set(scheduledDate, (map.get(scheduledDate) ?? 0) + 1);
    });
  });
  return map;
}

function nextAvailableDate(date: Date, occupancy: Map<string, number>): string {
  let candidate = startOfLocalDay(date);
  while ((occupancy.get(dateKey(candidate)) ?? 0) >= 3) {
    candidate = addDays(candidate, 1);
  }
  const key = dateKey(candidate);
  occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
  return key;
}

export function createEchoScheduleForNote(
  noteId: string,
  createdAt: string,
  existingNotes: Note[]
): EchoSchedule {
  const seed = seedFromString(noteId);
  const occupancy = occupancyFromNotes(existingNotes, noteId);
  let cursor = addDays(startOfLocalDay(createdAt), 1);
  const scheduledDates = [nextAvailableDate(cursor, occupancy)];

  ECHO_INTERVAL_RANGES.forEach((range, index) => {
    cursor = addDays(cursor, intervalForRange(seed, index, range));
    scheduledDates.push(nextAvailableDate(cursor, occupancy));
  });

  return {
    enabled: true,
    state: 'new',
    lastReviewedAt: null,
    nextDueAt: new Date(`${scheduledDates[0]}T09:00:00`).toISOString(),
    intervalDays: 1,
    ease: 2.5,
    occurrenceCount: 0,
    scheduledDates,
  };
}

export function normalizeEchoSchedule(
  echo: Partial<EchoSchedule> | null | undefined,
  createdAt: string,
  noteId: string,
  existingNotes: Note[] = []
): EchoSchedule {
  if (Array.isArray(echo?.scheduledDates) && echo.scheduledDates.length > 0) {
    const nextDueAt =
      typeof echo.nextDueAt === 'string'
        ? echo.nextDueAt
        : new Date(`${echo.scheduledDates[0]}T09:00:00`).toISOString();
    return {
      enabled: typeof echo.enabled === 'boolean' ? echo.enabled : true,
      state: echo.state === 'due' || echo.state === 'reviewed' ? echo.state : 'new',
      lastReviewedAt: typeof echo.lastReviewedAt === 'string' ? echo.lastReviewedAt : null,
      nextDueAt,
      intervalDays: typeof echo.intervalDays === 'number' ? echo.intervalDays : 1,
      ease: typeof echo.ease === 'number' ? echo.ease : 2.5,
      occurrenceCount: typeof echo.occurrenceCount === 'number' ? echo.occurrenceCount : 0,
      scheduledDates: echo.scheduledDates,
    };
  }
  return createEchoScheduleForNote(noteId, createdAt, existingNotes);
}

export function todayKey(): string {
  return dateKey(new Date());
}

