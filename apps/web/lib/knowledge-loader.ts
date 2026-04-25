import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { DocMeta, Role, Sensitivity } from "@/lib/rbac";

export interface Chunk {
  docId: string;
  heading: string;
  text: string;
  tokens: string[];
}

export interface LoadedDoc {
  meta: DocMeta;
  rawContent: string;
  chunks: Chunk[];
}

let cache: { docs: LoadedDoc[]; mtime: number } | null = null;

export function knowledgeRoot(): string {
  const envPath = process.env.KNOWLEDGE_DIR;
  const candidates: string[] = [];
  if (envPath) candidates.push(path.resolve(envPath));
  candidates.push(path.resolve(process.cwd(), "knowledge"));
  candidates.push(path.resolve(process.cwd(), "..", "..", "knowledge"));
  candidates.push(path.resolve(process.cwd(), "..", "knowledge"));
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

export function loadKnowledge(force = false): LoadedDoc[] {
  const root = knowledgeRoot();
  if (!fs.existsSync(root)) {
    throw new Error(`knowledge dir not found: ${root}`);
  }
  const mtime = fs.statSync(root).mtimeMs;
  if (!force && cache && cache.mtime === mtime) return cache.docs;

  const files = walk(root).filter(
    (f) => f.endsWith(".md") && !f.endsWith("README.md")
  );

  const docs: LoadedDoc[] = [];
  for (const abs of files) {
    const raw = fs.readFileSync(abs, "utf8");
    const parsed = matter(raw);
    const fm = parsed.data as Record<string, unknown>;
    if (!fm.id || !fm.title) continue;
    const rel = path.relative(root, abs).replace(/\\/g, "/");
    const meta: DocMeta = {
      id: String(fm.id),
      title: String(fm.title),
      owner: String(fm.owner ?? ""),
      audience: asRoleList(fm.audience),
      sensitivity: asSensitivity(fm.sensitivity),
      tags: asStringList(fm.tags),
      last_reviewed: String(fm.last_reviewed ?? ""),
      reviewer: String(fm.reviewer ?? ""),
      status: asStatus(fm.status),
      path: rel,
    };
    docs.push({
      meta,
      rawContent: parsed.content,
      chunks: chunkByHeading(meta.id, parsed.content),
    });
  }

  cache = { docs, mtime };
  return docs;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

function chunkByHeading(docId: string, body: string): Chunk[] {
  const lines = body.split(/\r?\n/);
  const chunks: Chunk[] = [];
  let currentHeading = "Introduction";
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) {
      chunks.push({
        docId,
        heading: currentHeading,
        text,
        tokens: tokenize(`${currentHeading}\n${text}`),
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    const h1 = /^#\s+(.+?)\s*$/.exec(line);
    if (h2) {
      flush();
      currentHeading = h2[1];
      continue;
    }
    if (h1) {
      flush();
      currentHeading = h1[1];
      continue;
    }
    buffer.push(line);
  }
  flush();
  return chunks;
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

function asRoleList(v: unknown): Role[] {
  const valid: Role[] = ["employee", "lead", "admin"];
  if (!Array.isArray(v)) return ["employee"];
  return v.map(String).filter((x): x is Role => valid.includes(x as Role));
}

function asSensitivity(v: unknown): Sensitivity {
  const s = String(v ?? "internal");
  return s === "public" || s === "restricted" ? s : "internal";
}

function asStatus(v: unknown): DocMeta["status"] {
  const s = String(v ?? "approved");
  return s === "draft" || s === "deprecated" ? s : "approved";
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(String);
}
