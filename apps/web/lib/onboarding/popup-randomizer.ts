/**
 * Pure scheduler — tính scheduled_at cho 3-5 popup/ngày của 1 account
 * theo FR-008: random uniform trong work-hours, gap tối thiểu 90 phút.
 *
 * Không touch DB / time API ngoài tham số — dễ test deterministic
 * bằng injected `rng` + `nowMs`.
 */

const MIN_GAP_MS = 90 * 60 * 1000;

export type PopupType = "motivation" | "check_in" | "humor";

export interface PopupRatio {
  motivation: number;
  check_in: number;
  humor: number;
}

export const DEFAULT_RATIO: PopupRatio = {
  motivation: 2,
  check_in: 2,
  humor: 1,
};

export interface DayPlanInput {
  date: Date;                  // base local-day
  workHoursStart: string;      // "HH:MM"
  workHoursEnd: string;        // "HH:MM"
  ratio?: PopupRatio;
  rng?: () => number;          // default Math.random
}

export interface PlannedPopup {
  type: PopupType;
  scheduledAt: Date;
}

export class PlanError extends Error {}

function parseHHMM(s: string): { h: number; m: number } {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) throw new PlanError(`work_hours không hợp lệ: ${s}`);
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) {
    throw new PlanError(`work_hours out of range: ${s}`);
  }
  return { h, m: mm };
}

function ratioToTypes(r: PopupRatio): PopupType[] {
  const out: PopupType[] = [];
  for (let i = 0; i < r.motivation; i++) out.push("motivation");
  for (let i = 0; i < r.check_in; i++) out.push("check_in");
  for (let i = 0; i < r.humor; i++) out.push("humor");
  return out;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function planPopupsForDay(input: DayPlanInput): PlannedPopup[] {
  const ratio = input.ratio ?? DEFAULT_RATIO;
  const total =
    ratio.motivation + ratio.check_in + ratio.humor;
  if (total < 3 || total > 5) {
    throw new PlanError(
      `Ratio total phải 3..5, nhận ${total} (${JSON.stringify(ratio)})`
    );
  }
  const rng = input.rng ?? Math.random;

  const start = parseHHMM(input.workHoursStart);
  const end = parseHHMM(input.workHoursEnd);

  const dayBase = new Date(input.date);
  dayBase.setHours(0, 0, 0, 0);
  const startMs =
    dayBase.getTime() + start.h * 3600_000 + start.m * 60_000;
  const endMs = dayBase.getTime() + end.h * 3600_000 + end.m * 60_000;
  if (endMs <= startMs) {
    throw new PlanError(
      `work_hours_end phải lớn hơn start: ${input.workHoursStart} → ${input.workHoursEnd}`
    );
  }

  const span = endMs - startMs;
  const requiredSpan = MIN_GAP_MS * (total - 1);
  if (span < requiredSpan) {
    throw new PlanError(
      `Khung giờ ${input.workHoursStart}-${input.workHoursEnd} không đủ ` +
        `cho ${total} popup với gap 90 phút (cần ≥ ${requiredSpan / 3600_000}h)`
    );
  }

  // Strategy: chia span thành `total` segment đều; trong mỗi segment chọn
  // 1 timestamp random; ép gap ≥ 90 phút bằng cách clamp left bound theo
  // popup trước.
  const segLen = span / total;
  const slots: number[] = [];
  for (let i = 0; i < total; i++) {
    const segStart = startMs + i * segLen;
    const segEnd = startMs + (i + 1) * segLen;
    const lower = i === 0
      ? segStart
      : Math.max(segStart, slots[i - 1] + MIN_GAP_MS);
    const upper = segEnd;
    if (lower > upper) {
      // segment quá ngắn — push lower vẫn chấp nhận (sẽ vi phạm random
      // nhưng giữ gap). Trong thực tế hiếm vì validate ở trên đã đảm bảo.
      slots.push(lower);
    } else {
      slots.push(lower + rng() * (upper - lower));
    }
  }

  const types = shuffle(ratioToTypes(ratio), rng);
  return slots.map((ts, i) => ({
    type: types[i],
    scheduledAt: new Date(Math.round(ts)),
  }));
}
