#!/usr/bin/env node
// Phase 1.2b: build vector index từ knowledge/ → Qdrant.
//
// Local BM25 (Phase 1.2) đã đủ target (recall@5 100%) ở scale < 5k chunks.
// Script này chuẩn bị sẵn cho khi scale lên, hoặc muốn thử hybrid mode:
//
//   1. Walk $KNOWLEDGE_DIR, parse front-matter + chunk theo H2.
//   2. Embed từng chunk qua Voyage-3 API.
//   3. Upsert vào Qdrant collection `knowledge` với payload {doc_id,
//      heading, audience, sensitivity, status}.
//
// Plan mode (không cần API key) — chạy: node scripts/build-index.mjs
// Apply mode — chạy: node scripts/build-index.mjs --apply
//
// Skip gracefully khi thiếu VOYAGE_API_KEY hoặc QDRANT_URL.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB = path.resolve(
  process.env.KNOWLEDGE_DIR ?? path.resolve(__dirname, "..", "..", "..", "knowledge")
);
const COLLECTION = process.env.QDRANT_COLLECTION ?? "knowledge";
const VOYAGE_MODEL = process.env.VOYAGE_MODEL ?? "voyage-3";
const APPLY = process.argv.includes("--apply");

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function chunkByH2(body) {
  const out = [];
  let heading = "Introduction";
  let buf = [];
  const flush = () => {
    const t = buf.join("\n").trim();
    if (t) out.push({ heading, text: t });
    buf = [];
  };
  for (const line of body.split(/\r?\n/)) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    const h1 = /^#\s+(.+?)\s*$/.exec(line);
    if (h2) { flush(); heading = h2[1]; continue; }
    if (h1) { flush(); heading = h1[1]; continue; }
    buf.push(line);
  }
  flush();
  return out;
}

function loadAllChunks() {
  const files = walk(KB).filter((f) => f.endsWith(".md") && !f.endsWith("README.md"));
  const all = [];
  for (const abs of files) {
    const p = matter(fs.readFileSync(abs, "utf8"));
    if (!p.data.id) continue;
    const rel = path.relative(KB, abs).replace(/\\/g, "/");
    for (const ch of chunkByH2(p.content)) {
      all.push({
        doc_id: p.data.id,
        path: rel,
        heading: ch.heading,
        text: ch.text,
        audience: p.data.audience ?? ["employee"],
        sensitivity: p.data.sensitivity ?? "internal",
        status: p.data.status ?? "approved",
      });
    }
  }
  return all;
}

async function embedVoyage(texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: "document",
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage API error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

async function qdrantRequest(method, url, body) {
  const headers = { "Content-Type": "application/json" };
  if (process.env.QDRANT_API_KEY) headers["api-key"] = process.env.QDRANT_API_KEY;
  const res = await fetch(`${process.env.QDRANT_URL}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Qdrant ${method} ${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function ensureCollection(dim) {
  try {
    await qdrantRequest("GET", `/collections/${COLLECTION}`);
    console.log(`[build-index] collection '${COLLECTION}' already exists`);
  } catch (err) {
    console.log(`[build-index] creating collection '${COLLECTION}' dim=${dim}`);
    await qdrantRequest("PUT", `/collections/${COLLECTION}`, {
      vectors: { size: dim, distance: "Cosine" },
    });
  }
}

async function upsert(points) {
  await qdrantRequest("PUT", `/collections/${COLLECTION}/points?wait=true`, { points });
}

async function main() {
  const all = loadAllChunks();
  console.log(`[build-index] kb=${KB} chunks=${all.length}`);

  if (!APPLY) {
    console.log("[build-index] dry-run (no --apply) — sẽ upsert các chunks:");
    for (const c of all.slice(0, 5)) {
      console.log(`  ${c.doc_id}/${c.heading}  [${c.audience.join(",")}] ${c.path}`);
    }
    if (all.length > 5) console.log(`  ...và ${all.length - 5} chunks khác`);
    return 0;
  }

  if (!process.env.VOYAGE_API_KEY) {
    console.error("[build-index] VOYAGE_API_KEY missing; set env để chạy --apply");
    return 2;
  }
  if (!process.env.QDRANT_URL) {
    console.error("[build-index] QDRANT_URL missing; set env để chạy --apply");
    return 2;
  }

  const BATCH = 16;
  let points = [];
  let embedded = 0;

  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    const texts = batch.map((c) => `${c.heading}\n\n${c.text}`);
    const vecs = await embedVoyage(texts);
    if (i === 0) await ensureCollection(vecs[0].length);
    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      points.push({
        id: `${c.doc_id}-${Buffer.from(c.heading).toString("hex").slice(0, 16)}`,
        vector: vecs[j],
        payload: {
          doc_id: c.doc_id,
          path: c.path,
          heading: c.heading,
          text: c.text.slice(0, 2000),
          audience: c.audience,
          sensitivity: c.sensitivity,
          status: c.status,
        },
      });
      embedded++;
    }
    if (points.length >= 64) {
      await upsert(points);
      points = [];
    }
    console.log(`[build-index] embedded ${embedded}/${all.length}`);
  }
  if (points.length) await upsert(points);
  console.log(`[build-index] done: ${embedded} chunks into ${COLLECTION}`);
  return 0;
}

main().then((code) => process.exit(code ?? 0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
