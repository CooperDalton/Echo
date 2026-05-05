import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

import { syncRepoSnapshot } from '../../src/sync';
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
    const merged = await syncRepoSnapshot(
      {
        owner: parsed.repo.owner,
        repo: parsed.repo.name,
        branch: parsed.repo.branch,
      },
      {
        recent: parsed.snapshot.notes.filter((note) => note.echo.state !== 'reviewed'),
        reviewed: parsed.snapshot.notes.filter((note) => note.echo.state === 'reviewed'),
        checkIns: parsed.snapshot.checkIns,
      },
      parsed.deviceId
    );

    sendJson(res, 200, {
      notes: [...merged.state.recent, ...merged.state.reviewed],
      checkIns: merged.state.checkIns,
      syncedAt: new Date().toISOString(),
      summary: merged.summary,
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    sendError(res, status, errorMessage(error));
  }
}
