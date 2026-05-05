const DEFAULT_ALLOWED_HEADERS = 'Content-Type, Authorization, X-GitHub-Event, X-GitHub-Delivery, X-Hub-Signature-256';

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', DEFAULT_ALLOWED_HEADERS);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function optionsResponse(): Response {
  return withCors(new Response(null, { status: 204 }));
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return withCors(
    Response.json(body, {
      status: init?.status,
      statusText: init?.statusText,
      headers: init?.headers,
    })
  );
}

export function errorResponse(status: number, error: string): Response {
  return jsonResponse({ error }, { status });
}
