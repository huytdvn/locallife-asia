import { Pool } from "pg";

/**
 * Lazy Postgres pool. Mọi optional — nếu DATABASE_URL không set, caller
 * gọi `isEnabled()` rồi decide: skip audit log, skip analytics.
 */
let _pool: Pool | null = null;

export function isEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

export function getPool(): Pool {
  if (!_pool) {
    if (!isEnabled()) {
      throw new Error("DATABASE_URL chưa set — không kết nối Postgres được");
    }
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }
  return _pool;
}

export async function query<R extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<R[]> {
  const res = await getPool().query(sql, params);
  return res.rows as R[];
}
