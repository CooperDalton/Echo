import type { VercelRequest, VercelResponse } from '@vercel/node';

import { supabase } from '../../src/supabase';
import { requireApiToken } from '../_lib/auth';
import { handleOptions, sendError, sendJson } from '../_lib/http';

const TABLES = [
  'notes',
  'check_ins',
  'deleted_notes',
  'bucket_preferences',
  'standing_messages',
] as const;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === 'OPTIONS') {
    handleOptions(res);
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'Method not allowed.');
    return;
  }
  if (!requireApiToken(req, res)) return;

  try {
    const results = await Promise.all(
      TABLES.map(async (table) => {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        if (error) throw error;
        return [table, count ?? 0] as const;
      })
    );

    sendJson(res, 200, {
      ok: true,
      service: 'echo-backend',
      database: 'reachable',
      counts: Object.fromEntries(results),
    });
  } catch (error) {
    sendError(
      res,
      500,
      error instanceof Error ? error.message : 'Unable to reach Supabase.'
    );
  }
}
