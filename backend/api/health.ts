import { env } from '../src/config';
import { jsonResponse, optionsResponse } from './_lib/http';

export function OPTIONS(): Response {
  return optionsResponse();
}

export function GET(): Response {
  return jsonResponse({
    ok: true,
    service: 'echo-backend',
    model: env.ECHO_OPENAI_MODEL,
  });
}
