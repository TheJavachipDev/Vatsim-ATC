import { checkRateLimit, clientIp } from "./rate-limit";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** JSON response with open CORS, a cache directive, and rate-limit headers. */
export function jsonResponse(
  data: unknown,
  init: { status?: number; sMaxAge?: number; rateLimit?: { remaining: number; resetAt: number } } = {},
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
  };
  if (init.sMaxAge !== undefined) {
    headers["Cache-Control"] = `public, s-maxage=${init.sMaxAge}, stale-while-revalidate=60`;
  }
  if (init.rateLimit) {
    headers["X-RateLimit-Remaining"] = String(init.rateLimit.remaining);
    headers["X-RateLimit-Reset"] = String(Math.ceil(init.rateLimit.resetAt / 1000));
  }
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, { status });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Enforce the per-IP rate limit; returns a 429 response when exceeded. */
export function enforceRateLimit(
  request: Request,
): { ok: true; remaining: number; resetAt: number } | { ok: false; response: Response } {
  const result = checkRateLimit(clientIp(request));
  if (!result.allowed) {
    const response = jsonResponse(
      { error: "Rate limit exceeded" },
      { status: 429, rateLimit: result },
    );
    response.headers.set("Retry-After", String(Math.ceil((result.resetAt - Date.now()) / 1000)));
    return { ok: false, response };
  }
  return { ok: true, remaining: result.remaining, resetAt: result.resetAt };
}
