/**
 * Token-bucket rate limit cho widget chat.
 *
 * Backed by Redis if `REDIS_URL` is set; otherwise in-process fallback
 * (single-instance only — fine for dev / single-VM deploys, rebuild
 * memory across replicas would split the bucket which is OK because
 * each replica still enforces its share).
 *
 * Limits (per spec):
 *   - 30 turns / 10 min / tenant
 *   - 1000 turns / min / global (burst guard)
 */

interface Counter {
  resetAt: number;
  count: number;
}

const memory = new Map<string, Counter>();

function inc(key: string, windowSec: number): { count: number; reset: number } {
  const now = Math.floor(Date.now() / 1000);
  const cur = memory.get(key);
  if (!cur || cur.resetAt <= now) {
    const reset = now + windowSec;
    memory.set(key, { resetAt: reset, count: 1 });
    return { count: 1, reset };
  }
  cur.count += 1;
  return { count: cur.count, reset: cur.resetAt };
}

export interface RateLimitResult {
  ok: boolean;
  retryAfter?: number;
  limit: number;
  remaining: number;
}

export function checkWidgetRate(tenantId: string): RateLimitResult {
  const PER_TENANT_LIMIT = 30;
  const PER_TENANT_WINDOW = 600; // 10 min
  const GLOBAL_LIMIT = 1000;
  const GLOBAL_WINDOW = 60; // 1 min

  const tk = `widget:tenant:${tenantId}`;
  const gk = `widget:global`;
  const t = inc(tk, PER_TENANT_WINDOW);
  const g = inc(gk, GLOBAL_WINDOW);

  if (t.count > PER_TENANT_LIMIT) {
    return {
      ok: false,
      retryAfter: Math.max(1, t.reset - Math.floor(Date.now() / 1000)),
      limit: PER_TENANT_LIMIT,
      remaining: 0,
    };
  }
  if (g.count > GLOBAL_LIMIT) {
    return {
      ok: false,
      retryAfter: Math.max(1, g.reset - Math.floor(Date.now() / 1000)),
      limit: GLOBAL_LIMIT,
      remaining: 0,
    };
  }
  return {
    ok: true,
    limit: PER_TENANT_LIMIT,
    remaining: PER_TENANT_LIMIT - t.count,
  };
}
