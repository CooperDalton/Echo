import crypto from 'node:crypto';

import { env } from '../../src/config';
import { errorResponse, jsonResponse, optionsResponse } from '../_lib/http';

function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!env.GITHUB_WEBHOOK_SECRET || !signature) return false;

  const digest = crypto
    .createHmac('sha256', env.GITHUB_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  return signature === `sha256=${digest}`;
}

export function OPTIONS(): Response {
  return optionsResponse();
}

export async function POST(request: Request): Promise<Response> {
  if (!env.GITHUB_WEBHOOK_SECRET) {
    return errorResponse(501, 'GITHUB_WEBHOOK_SECRET is not configured.');
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifyWebhookSignature(rawBody, signature)) {
    return errorResponse(401, 'Invalid webhook signature.');
  }

  const event = request.headers.get('x-github-event') ?? 'unknown';
  const delivery = request.headers.get('x-github-delivery') ?? 'unknown';
  console.log(
    JSON.stringify({
      event,
      delivery,
      receivedAt: new Date().toISOString(),
    })
  );

  return jsonResponse({ ok: true }, { status: 202 });
}
