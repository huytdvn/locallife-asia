#!/usr/bin/env node
// Gold eval runner — test BM25 retrieval + RBAC trên gold set.
// Chạy: pnpm --filter web eval
//
// Script này không cần Anthropic API — chạy trực tiếp trên retrieval layer.
// Đo: recall@5, citation precision, latency P50/P95, RBAC correctness.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB = path.resolve(__dirname, "..", "..", "..", "knowledge");
const GOLD = path.resolve(__dirname, "..", "..", "..", "evals", "gold.json");

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function tokenize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

function canRead(role, m) {
  if (m.status === "deprecated") return false;
  if (m.status === "draft" && role === "employee") return false;
  const allowed =
    role === "admin"
      ? ["employee", "lead", "admin"]
      : role === "lead"
        ? ["employee", "lead"]
        : ["employee"];
  if (!m.audience.some((a) => allowed.includes(a))) return false;
  if (m.sensitivity === "restricted" && role === "employee") return false;
  return true;
}

function loadDocs() {
  const files = walk(KB).filter((f) => f.endsWith(".md") && !f.endsWith("README.md"));
  const docs = [];
  for (const abs of files) {
    const p = matter(fs.readFileSync(abs, "utf8"));
    const fm = p.data;
    if (!fm.id) continue;
    const rel = path.relative(KB, abs).replace(/\\/g, "/");
    const docTitle = String(fm.title ?? "");
    const chunks = [];
    let heading = "Introduction";
    let buf = [];
    const flush = () => {
      const t = buf.join("\n").trim();
      if (t) chunks.push({ heading, text: t, tokens: tokenize(`${docTitle}\n${heading}\n${t}`) });
      buf = [];
    };
    for (const line of p.content.split(/\r?\n/)) {
      const h2 = /^##\s+(.+?)\s*$/.exec(line);
      const h1 = /^#\s+(.+?)\s*$/.exec(line);
      if (h2) { flush(); heading = h2[1]; continue; }
      if (h1) { flush(); heading = h1[1]; continue; }
      buf.push(line);
    }
    flush();
    docs.push({
      meta: {
        id: fm.id,
        audience: fm.audience ?? ["employee"],
        sensitivity: fm.sensitivity ?? "internal",
        status: fm.status ?? "approved",
        path: rel,
      },
      chunks,
    });
  }
  return docs;
}

function bm25(allChunks, query, topK) {
  const df = new Map();
  let totalDl = 0;
  for (const c of allChunks) {
    totalDl += c.tokens.length;
    const seen = new Set();
    for (const t of c.tokens) { if (!seen.has(t)) { seen.add(t); df.set(t, (df.get(t) ?? 0) + 1); } }
  }
  const n = allChunks.length;
  const avgDl = totalDl / n;
  const K1 = 1.5, B = 0.75;
  const qTok = Array.from(new Set(tokenize(query)));
  const out = [];
  for (const c of allChunks) {
    const tf = new Map();
    for (const t of c.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const q of qTok) {
      const f = tf.get(q);
      if (!f) continue;
      const nq = df.get(q) ?? 0;
      const idf = Math.log(1 + (n - nq + 0.5) / (nq + 0.5));
      const norm = f * (K1 + 1);
      const denom = f + K1 * (1 - B + (B * c.tokens.length) / avgDl);
      score += idf * (norm / denom);
    }
    if (score > 0) out.push({ c, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, topK);
}

function runCase(c, docs) {
  const all = [];
  for (const d of docs) for (const ch of d.chunks) all.push({ ...ch, meta: d.meta });
  const t0 = performance.now();
  const hits = bm25(all, c.query, 20);
  const filtered = [];
  for (const h of hits) {
    if (!canRead(c.role, h.c.meta)) continue;
    filtered.push(h);
    if (filtered.length >= 5) break;
  }
  const latencyMs = performance.now() - t0;
  const topPaths = filtered.map((h) => h.c.meta.path);
  const top1Path = topPaths[0];

  // Recall@5: bất kỳ expected_paths nào có trong top-5 thì pass.
  let recallPass = true;
  if (c.expected_paths?.length) {
    recallPass = c.expected_paths.some((p) => topPaths.includes(p));
  }
  // Citation precision@1: top-1 phải có trong expected_paths (nếu có).
  let precisionPass = true;
  if (c.expected_paths?.length && top1Path) {
    precisionPass = c.expected_paths.includes(top1Path);
  }
  // Negative case: path không được xuất hiện.
  let rbacPass = true;
  if (c.expected_paths_must_not_contain?.length) {
    rbacPass = !c.expected_paths_must_not_contain.some((p) => topPaths.includes(p));
  }
  return { id: c.id, role: c.role, query: c.query, latencyMs, topPaths, recallPass, precisionPass, rbacPass };
}

const gold = JSON.parse(fs.readFileSync(GOLD, "utf8"));
const docs = loadDocs();

const results = [];
for (const c of gold.cases) results.push(runCase(c, docs));

const n = results.length;
const recall = results.filter((r) => r.recallPass).length / n;
const precision = results.filter((r) => r.precisionPass).length / n;
const rbac = results.filter((r) => r.rbacPass).length / n;
const lats = results.map((r) => r.latencyMs).sort((a, b) => a - b);
const p50 = lats[Math.floor(lats.length * 0.5)];
const p95 = lats[Math.floor(lats.length * 0.95)];

console.log(`\n=== Gold eval results (${n} cases) ===`);
console.log(`Recall@5:            ${(recall * 100).toFixed(1)}%  target ≥ 95%`);
console.log(`Precision@1:         ${(precision * 100).toFixed(1)}%  target ≥ 90%`);
console.log(`RBAC negative pass:  ${(rbac * 100).toFixed(1)}%  target = 100%`);
console.log(`Retrieval latency:   P50=${p50.toFixed(1)}ms P95=${p95.toFixed(1)}ms`);

console.log(`\n--- Failures ---`);
let failures = 0;
for (const r of results) {
  if (r.recallPass && r.precisionPass && r.rbacPass) continue;
  failures++;
  const flags = [
    !r.recallPass && "RECALL",
    !r.precisionPass && "PRECISION",
    !r.rbacPass && "RBAC",
  ].filter(Boolean).join(",");
  console.log(`  [${flags}] ${r.id} (${r.role}) "${r.query}"`);
  for (const p of r.topPaths.slice(0, 3)) console.log(`      top: ${p}`);
}
if (failures === 0) console.log("  (none)");

const exitCode = recall >= 0.95 && precision >= 0.9 && rbac === 1 ? 0 : 1;
process.exit(exitCode);
