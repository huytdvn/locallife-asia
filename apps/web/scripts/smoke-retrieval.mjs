#!/usr/bin/env node
// Smoke test: chạy local BM25 retrieval trên knowledge/ với 3 role.
// Chạy: pnpm --filter web smoke:retrieval
//
// Script này chỉ để smoke-test nhanh — không dùng code thật trong lib/,
// re-implement minimal logic trong ESM để chạy được standalone.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE = path.resolve(__dirname, "..", "..", "..", "knowledge");

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
  const files = walk(KNOWLEDGE).filter(
    (f) => f.endsWith(".md") && !f.endsWith("README.md")
  );
  const docs = [];
  for (const abs of files) {
    const p = matter(fs.readFileSync(abs, "utf8"));
    const fm = p.data;
    if (!fm.id || !fm.title) continue;
    const rel = path.relative(KNOWLEDGE, abs).replace(/\\/g, "/");
    const docTitle = String(fm.title);
    const chunks = [];
    const lines = p.content.split(/\r?\n/);
    let heading = "Introduction";
    let buf = [];
    const flush = () => {
      const t = buf.join("\n").trim();
      if (t) chunks.push({ heading, text: t, tokens: tokenize(`${docTitle}\n${heading}\n${t}`) });
      buf = [];
    };
    for (const line of lines) {
      const h2 = /^##\s+(.+?)\s*$/.exec(line);
      const h1 = /^#\s+(.+?)\s*$/.exec(line);
      if (h2) { flush(); heading = h2[1]; continue; }
      if (h1) { flush(); heading = h1[1]; continue; }
      buf.push(line);
    }
    flush();
    docs.push({
      meta: {
        id: String(fm.id),
        title: String(fm.title),
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
    for (const t of c.tokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      df.set(t, (df.get(t) ?? 0) + 1);
    }
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

function run(query, role, docs) {
  const all = [];
  for (const d of docs) {
    for (const c of d.chunks) all.push({ ...c, meta: d.meta });
  }
  const hits = bm25(all, query, 20);
  const filtered = [];
  for (const h of hits) {
    if (!canRead(role, h.c.meta)) continue;
    filtered.push(h);
    if (filtered.length >= 5) break;
  }
  console.log(`\n─── [${role}] "${query}" — ${filtered.length} hits ───`);
  for (const h of filtered) {
    console.log(
      `  ${h.score.toFixed(2).padStart(6)}  ${h.c.meta.path}#${h.c.heading}`
    );
  }
}

const docs = loadDocs();
console.log(
  `Loaded ${docs.length} docs, ${docs.reduce((s, d) => s + d.chunks.length, 0)} chunks from ${KNOWLEDGE}`
);

const queries = [
  "xin nghỉ phép",
  "quy trình onboarding homestay",
  "hoàn tiền cho khách hàng",
  "công ty giữ bao nhiêu phần trăm",
  "giá trị cốt lõi công ty",
];
for (const q of queries) {
  run(q, "employee", docs);
  run(q, "admin", docs);
}
