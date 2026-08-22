import type { VercelRequest, VercelResponse } from '@vercel/node';

import { extractBearerToken, isApiTokenValid } from '../../src/auth';
import { env } from '../../src/config';
import { sendError } from './http';

export function requireApiToken(req: VercelRequest, res: VercelResponse): boolean {
  const token = extractBearerToken(req.headers.authorization);
  if (
    isApiTokenValid(token, env.ECHO_API_TOKEN)
      || (env.ECHO_API_TOKEN_NEXT && isApiTokenValid(token, env.ECHO_API_TOKEN_NEXT))
  ) return true;

  sendError(res, 401, 'Unauthorized.');
  return false;
}
