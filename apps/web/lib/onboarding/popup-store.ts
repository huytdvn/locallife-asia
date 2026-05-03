import { query, isEnabled } from "@/lib/db";
import {
  encryptForAccount,
  decryptForAccount,
  type EncryptedPayload,
} from "@/lib/onboarding/crypto";
import type { PopupType } from "@/lib/onboarding/popup-randomizer";

export interface DailyPopupRow {
  id: number;
  email: string;
  type: PopupType;
  contentText: string;
  humorCorrectOption: "A"|"B"|"C"|"D"|null;
  scheduledAt: Date;
  sentAt: Date | null;
  responseFlag: "responded"|"ignored"|"dismissed"|null;
  respondedAt: Date | null;
  humorUserAnswer: "A"|"B"|"C"|"D"|null;
  humorCorrect: boolean | null;
  humorReportedBad: boolean;
}

interface RawRow extends Record<string, unknown> {
  id: number;
  email: string;
  type: PopupType;
  content_text: string;
  humor_correct_option: "A"|"B"|"C"|"D"|null;
  scheduled_at: Date;
  sent_at: Date | null;
  response_flag: "responded"|"ignored"|"dismissed"|null;
  responded_at: Date | null;
  humor_user_answer: "A"|"B"|"C"|"D"|null;
  humor_correct: boolean | null;
  humor_reported_bad: boolean;
}

function map(r: RawRow): DailyPopupRow {
  return {
    id: r.id,
    email: r.email,
    type: r.type,
    contentText: r.content_text,
    humorCorrectOption: r.humor_correct_option,
    scheduledAt: r.scheduled_at,
    sentAt: r.sent_at,
    responseFlag: r.response_flag,
    respondedAt: r.responded_at,
    humorUserAnswer: r.humor_user_answer,
    humorCorrect: r.humor_correct,
    humorReportedBad: r.humor_reported_bad,
  };
}

const SELECT_COLS = `id, email, type, content_text, humor_correct_option,
  scheduled_at, sent_at, response_flag, responded_at,
  humor_user_answer, humor_correct, humor_reported_bad`;

export interface InsertPopupInput {
  email: string;
  type: PopupType;
  contentText: string;
  humorCorrectOption?: "A"|"B"|"C"|"D";
  scheduledAt: Date;
}

export async function insertPopup(input: InsertPopupInput): Promise<number> {
  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");
  const purgeAfter = new Date(input.scheduledAt);
  purgeAfter.setMonth(purgeAfter.getMonth() + 12);
  const rows = await query<{ id: number }>(
    `INSERT INTO daily_popup
       (email, type, content_text, humor_correct_option, scheduled_at, purge_after)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.email,
      input.type,
      input.contentText,
      input.humorCorrectOption ?? null,
      input.scheduledAt,
      purgeAfter,
    ]
  );
  return rows[0].id;
}

export async function getPendingForEmail(email: string): Promise<DailyPopupRow[]> {
  if (!isEnabled()) return [];
  const rows = await query<RawRow>(
    `SELECT ${SELECT_COLS}
     FROM daily_popup
     WHERE email = $1
       AND sent_at IS NOT NULL
       AND response_flag IS NULL
     ORDER BY sent_at DESC
     LIMIT 5`,
    [email]
  );
  return rows.map(map);
}

export async function getDueForDelivery(now: Date, batchSize = 200): Promise<DailyPopupRow[]> {
  if (!isEnabled()) return [];
  const rows = await query<RawRow>(
    `SELECT ${SELECT_COLS}
     FROM daily_popup
     WHERE scheduled_at <= $1 AND sent_at IS NULL
     ORDER BY scheduled_at ASC
     LIMIT $2`,
    [now, batchSize]
  );
  return rows.map(map);
}

export async function markSent(id: number): Promise<void> {
  await query(
    `UPDATE daily_popup SET sent_at = now() WHERE id = $1 AND sent_at IS NULL`,
    [id]
  );
}

export async function getById(id: number): Promise<DailyPopupRow | null> {
  if (!isEnabled()) return null;
  const rows = await query<RawRow>(
    `SELECT ${SELECT_COLS} FROM daily_popup WHERE id = $1`,
    [id]
  );
  return rows.length === 0 ? null : map(rows[0]);
}

export interface RespondInput {
  id: number;
  email: string;
  responseText?: string;
  humorAnswer?: "A"|"B"|"C"|"D";
}

export interface RespondResult {
  humorCorrect: boolean | null;
}

export async function respondToPopup(input: RespondInput): Promise<RespondResult> {
  const popup = await getById(input.id);
  if (!popup) throw new Error("Popup không tồn tại");
  if (popup.email !== input.email) throw new Error("Forbidden");
  if (popup.responseFlag) throw new Error("Popup đã được respond");

  let payload: EncryptedPayload | null = null;
  if (input.responseText && input.responseText.trim().length > 0) {
    payload = await encryptForAccount(input.email, input.responseText);
  }

  let humorCorrect: boolean | null = null;
  if (popup.type === "humor" && popup.humorCorrectOption) {
    if (!input.humorAnswer) throw new Error("Humor popup cần humorAnswer");
    humorCorrect = input.humorAnswer === popup.humorCorrectOption;
  }

  await query(
    `UPDATE daily_popup
       SET response_flag = 'responded',
           responded_at = now(),
           response_text_encrypted = $1,
           response_nonce = $2,
           humor_user_answer = $3,
           humor_correct = $4
     WHERE id = $5`,
    [
      payload?.ciphertext ?? null,
      payload?.nonce ?? null,
      input.humorAnswer ?? null,
      humorCorrect,
      input.id,
    ]
  );

  return { humorCorrect };
}

export async function dismissPopup(id: number, email: string): Promise<void> {
  await query(
    `UPDATE daily_popup
       SET response_flag = 'dismissed',
           responded_at = now()
     WHERE id = $1 AND email = $2 AND response_flag IS NULL`,
    [id, email]
  );
}

export async function flagBadHumor(id: number, email: string): Promise<void> {
  await query(
    `UPDATE daily_popup
       SET humor_reported_bad = true
     WHERE id = $1 AND email = $2 AND type = 'humor'`,
    [id, email]
  );
}

export async function decryptResponseAsAdmin(
  popupId: number
): Promise<{ email: string; responseText: string | null }> {
  const popup = await getById(popupId);
  if (!popup) throw new Error("Popup không tồn tại");
  if (!popup.responseFlag) {
    return { email: popup.email, responseText: null };
  }
  const rows = await query<{
    email: string;
    response_text_encrypted: Buffer | null;
    response_nonce: Buffer | null;
  }>(
    `SELECT email, response_text_encrypted, response_nonce FROM daily_popup WHERE id = $1`,
    [popupId]
  );
  if (rows.length === 0) throw new Error("Popup không tồn tại");
  const r = rows[0];
  if (!r.response_text_encrypted || !r.response_nonce) {
    return { email: r.email, responseText: null };
  }
  const text = await decryptForAccount(
    r.email,
    r.response_text_encrypted,
    r.response_nonce
  );
  return { email: r.email, responseText: text };
}

/**
 * Sweep purge — xoá ciphertext + nonce cho popup quá `purge_after`.
 * Giữ metadata (response_flag, humor_correct) cho aggregate.
 */
export async function purgeExpiredResponses(now: Date): Promise<number> {
  const res = await query<{ id: number }>(
    `UPDATE daily_popup
       SET response_text_encrypted = NULL,
           response_nonce = NULL
     WHERE purge_after < $1
       AND response_text_encrypted IS NOT NULL
     RETURNING id`,
    [now]
  );
  return res.length;
}
