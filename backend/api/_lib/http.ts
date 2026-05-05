import type { VercelResponse } from '@vercel/node';

const DEFAULT_ALLOWED_HEADERS =
  'Content-Type, Authorization, X-GitHub-Event, X-GitHub-Delivery, X-Hub-Signature-256';

export function applyCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', DEFAULT_ALLOWED_HEADERS);
}

export function handleOptions(res: VercelResponse): void {
  applyCors(res);
  res.status(204).end();
}

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  applyCors(res);
  res.status(status).json(body);
}

export function sendError(res: VercelResponse, status: number, error: string): void {
  sendJson(res, status, { error });
}
