import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

import { shortenWidgetNote } from '../../src/openai';
import { requireApiToken } from '../_lib/auth';
import { handleOptions, sendError, sendJson } from '../_lib/http';
import { shortenWidgetNoteRequestSchema } from '../_lib/schemas';

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
  if (!requireApiToken(req, res)) return;

  try {
    const parsed = shortenWidgetNoteRequestSchema.parse(req.body);
    const result = await shortenWidgetNote(parsed.note, parsed.maxLength);
    sendJson(res, 200, result);
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    sendError(res, status, errorMessage(error));
  }
}
