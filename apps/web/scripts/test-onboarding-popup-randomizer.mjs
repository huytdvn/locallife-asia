#!/usr/bin/env node
/**
 * Unit tests for popup-randomizer (FR-008).
 *
 * Re-implements the algorithm in JS-only form so test runs without a TS
 * build step (matches existing repo convention — see test-units.mjs).
 * Keep in sync with apps/web/lib/onboarding/popup-randomizer.ts.
 *
 * Run: node --test apps/web/scripts/test-onboarding-popup-randomizer.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const MIN_GAP_MS = 90 * 60 * 1000;
const DEFAULT_RATIO = { motivation: 2, check_in: 2, humor: 1 };

function parseHHMM(s) {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`work_hours không hợp lệ: ${s}`);
  return { h: Number(m[1]), m: Number(m[2]) };
}

function ratioToTypes(r) {
  const out = [];
  for (let i = 0; i < r.motivation; i++) out.push("motivation");
  for (let i = 0; i < r.check_in; i++) out.push("check_in");
  for (let i = 0; i < r.humor; i++) out.push("humor");
  return out;
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function planPopupsForDay({ date, workHoursStart, workHoursEnd, ratio = DEFAULT_RATIO, rng = Math.random }) {
  const total = ratio.motivation + ratio.check_in + ratio.humor;
  if (total < 3 || total > 5) {
    throw new Error(`Ratio total phải 3..5, nhận ${total}`);
  }
  const start = parseHHMM(workHoursStart);
  const end = parseHHMM(workHoursEnd);
  const dayBase = new Date(date);
  dayBase.setHours(0, 0, 0, 0);
  const startMs = dayBase.getTime() + start.h * 3600_000 + start.m * 60_000;
  const endMs = dayBase.getTime() + end.h * 3600_000 + end.m * 60_000;
  if (endMs <= startMs) throw new Error("end <= start");
  const span = endMs - startMs;
  const requiredSpan = MIN_GAP_MS * (total - 1);
  if (span < requiredSpan) throw new Error("span insufficient");

  const segLen = span / total;
  const slots = [];
  for (let i = 0; i < total; i++) {
    const segStart = startMs + i * segLen;
    const segEnd = startMs + (i + 1) * segLen;
    const lower = i === 0 ? segStart : Math.max(segStart, slots[i - 1] + MIN_GAP_MS);
    const upper = segEnd;
    slots.push(lower > upper ? lower : lower + rng() * (upper - lower));
  }
  const types = shuffle(ratioToTypes(ratio), rng);
  return slots.map((ts, i) => ({ type: types[i], scheduledAt: new Date(Math.round(ts)) }));
}

function makeRng(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

test("default ratio: 5 popups", () => {
  const out = planPopupsForDay({
    date: new Date(2026, 4, 4),
    workHoursStart: "08:30",
    workHoursEnd: "18:00",
    rng: makeRng(42),
  });
  assert.equal(out.length, 5);
});

test("min-gap 90 minutes between consecutive popups", () => {
  const out = planPopupsForDay({
    date: new Date(2026, 4, 4),
    workHoursStart: "08:30",
    workHoursEnd: "18:00",
    rng: makeRng(13),
  });
  for (let i = 1; i < out.length; i++) {
    const gap = out[i].scheduledAt.getTime() - out[i - 1].scheduledAt.getTime();
    assert.ok(
      gap >= MIN_GAP_MS,
      `gap ${gap / 60_000}min < 90min between ${out[i - 1].scheduledAt.toISOString()} and ${out[i].scheduledAt.toISOString()}`
    );
  }
});

test("all popups within work-hours", () => {
  const out = planPopupsForDay({
    date: new Date(2026, 4, 4),
    workHoursStart: "08:30",
    workHoursEnd: "18:00",
    rng: makeRng(7),
  });
  for (const p of out) {
    const h = p.scheduledAt.getHours();
    const m = p.scheduledAt.getMinutes();
    const minutes = h * 60 + m;
    assert.ok(minutes >= 8 * 60 + 30, `${p.scheduledAt.toISOString()} before 08:30`);
    assert.ok(minutes <= 18 * 60, `${p.scheduledAt.toISOString()} after 18:00`);
  }
});

test("ratio respected: types match counts", () => {
  const out = planPopupsForDay({
    date: new Date(2026, 4, 4),
    workHoursStart: "08:30",
    workHoursEnd: "18:00",
    ratio: { motivation: 3, check_in: 1, humor: 1 },
    rng: makeRng(99),
  });
  const counts = { motivation: 0, check_in: 0, humor: 0 };
  for (const p of out) counts[p.type]++;
  assert.deepEqual(counts, { motivation: 3, check_in: 1, humor: 1 });
});

test("throws when work-hours too short", () => {
  assert.throws(() => {
    planPopupsForDay({
      date: new Date(2026, 4, 4),
      workHoursStart: "09:00",
      workHoursEnd: "11:00",
      rng: makeRng(1),
    });
  });
});

test("throws when ratio total < 3 or > 5", () => {
  assert.throws(() =>
    planPopupsForDay({
      date: new Date(2026, 4, 4),
      workHoursStart: "08:30",
      workHoursEnd: "18:00",
      ratio: { motivation: 1, check_in: 0, humor: 1 },
      rng: makeRng(1),
    })
  );
  assert.throws(() =>
    planPopupsForDay({
      date: new Date(2026, 4, 4),
      workHoursStart: "08:30",
      workHoursEnd: "18:00",
      ratio: { motivation: 3, check_in: 2, humor: 1 },
      rng: makeRng(1),
    })
  );
});

test("deterministic with same seed", () => {
  const a = planPopupsForDay({
    date: new Date(2026, 4, 4),
    workHoursStart: "08:30",
    workHoursEnd: "18:00",
    rng: makeRng(123),
  });
  const b = planPopupsForDay({
    date: new Date(2026, 4, 4),
    workHoursStart: "08:30",
    workHoursEnd: "18:00",
    rng: makeRng(123),
  });
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].type, b[i].type);
    assert.equal(a[i].scheduledAt.getTime(), b[i].scheduledAt.getTime());
  }
});
