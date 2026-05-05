import { z } from 'zod';

import { classifyNote } from '../../src/openai';
import { classifyRequestSchema } from '../_lib/schemas';
import { errorResponse, jsonResponse, optionsResponse } from '../_lib/http';

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
    const parsed = classifyRequestSchema.parse(body);
    const result = await classifyNote(parsed.note);

    return jsonResponse({
      bucket: result.bucket,
      confidence: result.confidence,
      method: 'ai',
      model: result.model,
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return errorResponse(status, errorMessage(error));
  }
}
