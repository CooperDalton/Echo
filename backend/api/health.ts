import type { VercelRequest, VercelResponse } from '@vercel/node';

import { env } from '../src/config';
import { handleOptions, sendJson } from './_lib/http';

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method === 'OPTIONS') {
    handleOptions(res);
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    service: 'echo-backend',
    model: env.ECHO_OPENAI_MODEL,
  });
}
