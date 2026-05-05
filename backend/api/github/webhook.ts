import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { env } from '../../src/config';
import { handleOptions, sendError, sendJson } from '../_lib/http';

function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!env.GITHUB_WEBHOOK_SECRET || !signature) return false;

  const digest = crypto
    .createHmac('sha256', env.GITHUB_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  return signature === `sha256=${digest}`;
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

  if (!env.GITHUB_WEBHOOK_SECRET) {
    sendError(res, 501, 'GITHUB_WEBHOOK_SECRET is not configured.');
    return;
  }

  const rawBody =
    typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  const signatureHeader = req.headers['x-hub-signature-256'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader ?? null;
  if (!verifyWebhookSignature(rawBody, signature)) {
    sendError(res, 401, 'Invalid webhook signature.');
    return;
  }

  const eventHeader = req.headers['x-github-event'];
  const deliveryHeader = req.headers['x-github-delivery'];
  const event = Array.isArray(eventHeader) ? eventHeader[0] : eventHeader ?? 'unknown';
  const delivery = Array.isArray(deliveryHeader) ? deliveryHeader[0] : deliveryHeader ?? 'unknown';
  console.log(
    JSON.stringify({
      event,
      delivery,
      receivedAt: new Date().toISOString(),
    })
  );

  sendJson(res, 202, { ok: true });
}
