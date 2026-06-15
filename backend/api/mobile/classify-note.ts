import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

import { classifyNote } from '../../src/openai';
import { classifyRequestSchema } from '../_lib/schemas';
import { handleOptions, sendError, sendJson } from '../_lib/http';

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
    const parsed = classifyRequestSchema.parse(req.body);
    const result = await classifyNote(parsed.note, parsed.buckets);

    sendJson(res, 200, {
      title: result.title,
      bucket: result.bucket,
      confidence: result.confidence,
      method: 'ai',
      model: result.model,
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    sendError(res, status, errorMessage(error));
  }
}
