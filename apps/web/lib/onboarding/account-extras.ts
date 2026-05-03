import { query, isEnabled } from "@/lib/db";

export interface AccountExtras {
  email: string;
  timezone: string;
  workHoursStart: string;
  workHoursEnd: string;
  level: "entry" | "mid" | "senior";
  onboardingBotEnabled: boolean;
  popupRatioOverride: { motivation: number; check_in: number; humor: number } | null;
  isOnLeave: boolean;
  leaveUntil: Date | null;
}

interface Row extends Record<string, unknown> {
  email: string;
  timezone: string;
  work_hours_start: string;
  work_hours_end: string;
  level: "entry" | "mid" | "senior";
  onboarding_bot_enabled: boolean;
  popup_ratio_override: { motivation: number; check_in: number; humor: number } | null;
  is_on_leave: boolean;
  leave_until: Date | null;
}

function map(row: Row): AccountExtras {
  return {
    email: row.email,
    timezone: row.timezone,
    workHoursStart: row.work_hours_start,
    workHoursEnd: row.work_hours_end,
    level: row.level,
    onboardingBotEnabled: row.onboarding_bot_enabled,
    popupRatioOverride: row.popup_ratio_override,
    isOnLeave: row.is_on_leave,
    leaveUntil: row.leave_until,
  };
}

export async function getExtras(email: string): Promise<AccountExtras | null> {
  if (!isEnabled()) return null;
  const rows = await query<Row>(
    `SELECT email, timezone, work_hours_start, work_hours_end, level,
            onboarding_bot_enabled, popup_ratio_override, is_on_leave, leave_until
     FROM account_extras WHERE email = $1`,
    [email]
  );
  return rows.length === 0 ? null : map(rows[0]);
}

export async function listActiveAccounts(): Promise<AccountExtras[]> {
  if (!isEnabled()) return [];
  const rows = await query<Row>(
    `SELECT email, timezone, work_hours_start, work_hours_end, level,
            onboarding_bot_enabled, popup_ratio_override, is_on_leave, leave_until
     FROM account_extras
     WHERE onboarding_bot_enabled = true
       AND is_on_leave = false`
  );
  return rows.map(map);
}

export async function ensureExtras(email: string): Promise<AccountExtras> {
  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");
  await query(
    `INSERT INTO account_extras (email)
     VALUES ($1)
     ON CONFLICT (email) DO NOTHING`,
    [email]
  );
  const got = await getExtras(email);
  if (!got) throw new Error(`Không tạo được account_extras cho ${email}`);
  return got;
}
