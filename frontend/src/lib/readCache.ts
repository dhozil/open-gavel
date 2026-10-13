/**
 * Read cache for contract calls.
 *
 * StudioNet allows ~30 gen_call requests per minute per IP (shared by the CLI,
 * scripts, and every browser tab), and the 429 comes back WITHOUT an
 * Access-Control-Allow-Origin header — so fetch rejects with "Failed to fetch"
 * and the browser reports a CORS error that is really a rate limit. Request
 * volume is therefore a correctness problem, not a performance one.
 * (Ported from the exemplum/ai-notary frontend's proven pattern.)
 *
 * Two guards:
 *  - Single flight: concurrent identical reads share one request.
 *  - Short TTL (8s): back-and-forth navigation inside the window is free.
 *
 * Failures are never cached. Writes bump the generation, invalidating
 * everything — a finalized write must never leave a stale verdict on screen.
 */

const DEFAULT_TTL_MS = 8_000;

interface Entry {
  at: number;
  value: unknown;
}

const fresh = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

let generation = 0;

function key(parts: unknown[]): string {
  return JSON.stringify(parts);
}

/** Drops every cached read. Called after a successful write. */
export function invalidateReads(): void {
  generation += 1;
  fresh.clear();
}

/** Read-through cache with request coalescing. */
export function cachedRead<T>(
  parts: unknown[],
  run: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const k = `${generation}:${key(parts)}`;
  const now = Date.now();

  const hit = fresh.get(k);
  if (hit && now - hit.at < ttlMs) {
    return Promise.resolve(hit.value as T);
  }

  const pending = inFlight.get(k);
  if (pending) return pending as Promise<T>;

  const request = run()
    .then((value) => {
      fresh.set(k, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      inFlight.delete(k);
    });

  inFlight.set(k, request);
  return request;
}

/** True when the error smells like the shared-budget rate limit. */
export function isRateLimit(err: unknown): boolean {
  const t = String(err instanceof Error ? err.message : err).toLowerCase();
  return (
    t.includes("rate limit") ||
    t.includes("too many requests") ||
    t.includes("429") ||
    t.includes("-32029") ||
    t.includes("failed to fetch") ||
    t.includes("networkerror") ||
    t.includes("load failed")
  );
}

export function rateLimitMessage(): string {
  return "StudioNet rate-limited this IP (30 calls/min shared budget). Wait about a minute, then retry — nothing is broken.";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry transient (rate-limit/network) failures with growing delays.
 *  Kept short for UI reads (2s/4s): a hot budget won't cool in seconds, so
 *  fail fast into the honest rate-limit message instead of hanging the page. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isRateLimit(e) || i === tries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
  throw last;
}
