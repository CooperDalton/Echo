import { z } from 'zod';

import { syncRepoSnapshot } from '../../src/sync';
import { errorResponse, jsonResponse, optionsResponse } from '../_lib/http';
import { syncRequestSchema } from '../_lib/schemas';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unexpected server error.';
}

export function OPTIONS(): Response {
  return optionsResponse();
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = syncRequestSchema.parse(body);
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

    return jsonResponse({
      notes: [...merged.state.recent, ...merged.state.reviewed],
      checkIns: merged.state.checkIns,
      syncedAt: new Date().toISOString(),
      summary: merged.summary,
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return errorResponse(status, errorMessage(error));
  }
}
