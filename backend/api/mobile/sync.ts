import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

import { syncSupabaseSnapshot } from '../../src/sync';
import { handleOptions, sendError, sendJson } from '../_lib/http';
import { syncRequestSchema } from '../_lib/schemas';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unexpected server error.';
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === 'OPTIONS') {
    handleOptions(res);
    return;
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed.');
    return;
  }

  try {
    const parsed = syncRequestSchema.parse(req.body);
    const merged = await syncSupabaseSnapshot(
      {
        recent: parsed.snapshot.notes.filter((note) => note.echo.state !== 'reviewed'),
        reviewed: parsed.snapshot.notes.filter((note) => note.echo.state === 'reviewed'),
        checkIns: parsed.snapshot.checkIns,
        deletedNotes: parsed.snapshot.deletedNotes,
        bucketPreferences: parsed.snapshot.bucketPreferences,
        standingMessages: parsed.snapshot.standingMessages,
      },
      parsed.deviceId
    );

    sendJson(res, 200, {
      notes: [...merged.state.recent, ...merged.state.reviewed],
      checkIns: merged.state.checkIns,
      deletedNotes: merged.state.deletedNotes,
      bucketPreferences: merged.state.bucketPreferences,
      standingMessages: merged.state.standingMessages,
      syncedAt: new Date().toISOString(),
      summary: merged.summary,
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    sendError(res, status, errorMessage(error));
  }
}
