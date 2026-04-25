import fs from "node:fs";
import path from "node:path";
import { knowledgeRoot, loadKnowledge } from "@/lib/knowledge-loader";
import { canRead, type Role } from "@/lib/rbac";

export interface TrainingStep {
  doc_path: string;
  note?: string;
  // Enriched khi serve:
  doc_id?: string;
  title?: string;
  status?: string;
  accessible?: boolean;
}

export interface TrainingSection {
  name: string;
  steps: TrainingStep[];
}

export interface TrainingPath {
  slug: string;
  title: string;
  subtitle?: string;
  for_roles: Role[];
  for_audience_tag?: string;
  duration?: string;
  owner?: string;
  sections: TrainingSection[];
  total_steps?: number;
  accessible_steps?: number;
}

interface TrainingFile {
  description?: string;
  paths: TrainingPath[];
}

let cache: { mtime: number; data: TrainingFile } | null = null;

function loadFile(): TrainingFile {
  const file = path.join(knowledgeRoot(), "training.json");
  if (!fs.existsSync(file)) return { paths: [] };
  const mtime = fs.statSync(file).mtimeMs;
  if (cache && cache.mtime === mtime) return cache.data;
  const raw = fs.readFileSync(file, "utf-8");
  const parsed = JSON.parse(raw) as TrainingFile;
  cache = { mtime, data: parsed };
  return parsed;
}

/**
 * Trả paths phù hợp với role hiện tại, enriched với title + accessibility
 * dựa trên RBAC (doc nào role không đọc được → đánh dấu accessible:false).
 */
export function getPathsForRole(role: Role): TrainingPath[] {
  const file = loadFile();
  const docs = loadKnowledge();
  const docByPath = new Map(docs.map((d) => [d.meta.path, d.meta]));

  return file.paths
    .filter((p) => p.for_roles.includes(role))
    .map((p) => enrichPath(p, role, docByPath));
}

export function getPathBySlug(slug: string, role: Role): TrainingPath | null {
  const file = loadFile();
  const found = file.paths.find((p) => p.slug === slug);
  if (!found) return null;
  if (!found.for_roles.includes(role)) return null;
  const docs = loadKnowledge();
  const docByPath = new Map(docs.map((d) => [d.meta.path, d.meta]));
  return enrichPath(found, role, docByPath);
}

function enrichPath(
  p: TrainingPath,
  role: Role,
  docByPath: Map<string, ReturnType<typeof loadKnowledge>[number]["meta"]>
): TrainingPath {
  let total = 0;
  let accessible = 0;
  const sections = p.sections.map((s) => ({
    ...s,
    steps: s.steps.map((step) => {
      total++;
      const meta = docByPath.get(step.doc_path);
      const acc = meta ? canRead(role, meta) : false;
      if (acc) accessible++;
      return {
        ...step,
        doc_id: meta?.id,
        title: meta?.title ?? "(chưa có doc)",
        status: meta?.status,
        accessible: acc,
      };
    }),
  }));
  return { ...p, sections, total_steps: total, accessible_steps: accessible };
}
