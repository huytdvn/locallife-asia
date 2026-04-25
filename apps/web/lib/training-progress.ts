import fs from "node:fs";
import path from "node:path";

/**
 * Server-side progress tracking. Persisted ở JSON file đơn giản,
 * thay localStorage để admin report + cross-device.
 *
 * Format:
 * {
 *   "<email>": {
 *     "<slug>": {
 *       "started_at": "<iso>",
 *       "updated_at": "<iso>",
 *       "completed_steps": ["doc_path1", ...],
 *       "quiz": {
 *         "attempts": [
 *           { "attempt_id": "<ulid>", "ts": "<iso>", "score": 0.8, "passed": true }
 *         ],
 *         "best_score": 0.8,
 *         "passed_at": "<iso>"
 *       }
 *     }
 *   }
 * }
 */

export interface QuizAttempt {
  attempt_id: string;
  ts: string;
  score: number;
  passed: boolean;
}

export interface PathProgress {
  started_at: string;
  updated_at: string;
  completed_steps: string[];
  quiz?: {
    attempts: QuizAttempt[];
    best_score: number;
    passed_at: string | null;
  };
}

export interface UserProgress {
  [slug: string]: PathProgress;
}

export interface AllProgress {
  [email: string]: UserProgress;
}

function progressFile(): string {
  const dir = path.resolve(process.cwd(), ".cache", "training");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "progress.json");
}

function readAll(): AllProgress {
  const file = progressFile();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as AllProgress;
  } catch {
    return {};
  }
}

function writeAll(data: AllProgress): void {
  const file = progressFile();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

export function getProgress(
  email: string,
  slug: string
): PathProgress | null {
  const all = readAll();
  return all[email]?.[slug] ?? null;
}

export function getUserProgress(email: string): UserProgress {
  const all = readAll();
  return all[email] ?? {};
}

export function getAllProgress(): AllProgress {
  return readAll();
}

export function ensurePath(email: string, slug: string): PathProgress {
  const all = readAll();
  const user = all[email] ?? {};
  const existing = user[slug];
  if (existing) return existing;
  const now = new Date().toISOString();
  const fresh: PathProgress = {
    started_at: now,
    updated_at: now,
    completed_steps: [],
  };
  user[slug] = fresh;
  all[email] = user;
  writeAll(all);
  return fresh;
}

export function markStep(
  email: string,
  slug: string,
  docPath: string,
  done: boolean
): PathProgress {
  const all = readAll();
  const user = all[email] ?? {};
  const now = new Date().toISOString();
  const p: PathProgress = user[slug] ?? {
    started_at: now,
    updated_at: now,
    completed_steps: [],
  };
  const set = new Set(p.completed_steps);
  if (done) set.add(docPath);
  else set.delete(docPath);
  p.completed_steps = [...set];
  p.updated_at = now;
  user[slug] = p;
  all[email] = user;
  writeAll(all);
  return p;
}

export function recordQuizAttempt(
  email: string,
  slug: string,
  score: number,
  passed: boolean,
  attemptId: string
): PathProgress {
  const all = readAll();
  const user = all[email] ?? {};
  const now = new Date().toISOString();
  const p: PathProgress = user[slug] ?? {
    started_at: now,
    updated_at: now,
    completed_steps: [],
  };
  const quiz = p.quiz ?? { attempts: [], best_score: 0, passed_at: null };
  quiz.attempts.push({ attempt_id: attemptId, ts: now, score, passed });
  if (score > quiz.best_score) quiz.best_score = score;
  if (passed && !quiz.passed_at) quiz.passed_at = now;
  p.quiz = quiz;
  p.updated_at = now;
  user[slug] = p;
  all[email] = user;
  writeAll(all);
  return p;
}
