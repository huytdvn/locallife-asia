/**
 * Token-bucket rate limit cho widget chat.
 *
 * In-process counter — single-instance only. Behind a horizontal scale-out
 * each replica enforces its own share, which is acceptable degradation
 * (the global limit becomes per-replica). When/if we move to N replicas,
 * swap the Map for a Redis INCR with EXPIRE — TODO not done yet.
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
let lastSweepAt = 0;
const SWEEP_INTERVAL_SEC = 60;

/**
 * Drop entries whose window has already expired. Called opportunistically
 * inside `inc()` at most once per minute. Without this, every distinct
 * tenantId that ever hits the endpoint stays in the Map forever — that's
 * a slow leak under any realistic multi-tenant traffic.
 */
function maybeSweep(now: number): void {
  if (now - lastSweepAt < SWEEP_INTERVAL_SEC) return;
  lastSweepAt = now;
  for (const [k, v] of memory) {
    if (v.resetAt <= now) memory.delete(k);
  }
}

function inc(key: string, windowSec: number): { count: number; reset: number } {
  const now = Math.floor(Date.now() / 1000);
  maybeSweep(now);
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
