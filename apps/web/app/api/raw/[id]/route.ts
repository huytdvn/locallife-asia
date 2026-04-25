import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { knowledgeRoot, loadKnowledge } from "@/lib/knowledge-loader";
import { canRead } from "@/lib/rbac";
import matter from "gray-matter";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

/**
 * GET /api/raw/{id}
 *   Serve file raw gốc của doc. Check RBAC trước.
 *   Tham số query:
 *     - download=1  → gửi Content-Disposition attachment
 *     - inline=1    → (default) display inline
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  const { id } = await params;

  const doc = loadKnowledge().find((d) => d.meta.id === id);
  if (!doc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!canRead(session.role, doc.meta)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Lấy ULID + ext từ source[0].path (format `raw-ulid/{ulid}{ext}`)
  const kbDir = knowledgeRoot();
  const parsed = matter(
    fs.readFileSync(path.join(kbDir, doc.meta.path), "utf-8")
  );
  const source = (parsed.data.source as Array<{ path?: string }> | undefined)?.[0];
  if (!source?.path) {
    return NextResponse.json(
      { error: "no_raw_source", message: "Tài liệu này không có file gốc (soạn manual)." },
      { status: 404 }
    );
  }
  const m = /^raw-ulid\/([0-9A-Z]{26})(\.[a-zA-Z0-9]+)$/.exec(source.path);
  if (!m) {
    return NextResponse.json({ error: "malformed_source_path" }, { status: 500 });
  }
  const [, ulid, ext] = m;

  // Smart fallback tìm RAW_DIR tương tự knowledge-loader
  const rawDir = resolveRawDir();
  const found = rawDir ? findRawFile(rawDir, `${ulid}${ext}`) : null;
  if (!found) {
    return NextResponse.json(
      {
        error: "raw_file_missing",
        hint: `Không tìm thấy ${ulid}${ext} trong ${rawDir ?? "(không xác định RAW_DIR)"}. File gốc có thể đã bị xóa hoặc upload ở môi trường khác.`,
      },
      { status: 404 }
    );
  }

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  const mime = MIME[ext.replace(".", "").toLowerCase()] ?? "application/octet-stream";
  const data = fs.readFileSync(found);
  const displayName = `${slug(doc.meta.title)}${ext}`;

  return new NextResponse(data as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(displayName)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}

function findRawFile(root: string, filename: string): string | null {
  if (!fs.existsSync(root)) return null;
  const queue: string[] = [root];
  while (queue.length) {
    const dir = queue.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) queue.push(abs);
      else if (e.name === filename) return abs;
    }
  }
  return null;
}

function resolveRawDir(): string | null {
  const envPath = process.env.RAW_DIR;
  const candidates: string[] = [];
  if (envPath) candidates.push(path.resolve(envPath));
  candidates.push(path.resolve(process.cwd(), "tmp", "raw"));
  candidates.push(path.resolve(process.cwd(), "..", "ingest", "tmp", "raw"));
  candidates.push(path.resolve(process.cwd(), "..", "..", "apps", "ingest", "tmp", "raw"));
  candidates.push(path.resolve(process.cwd(), "..", "..", "tmp", "raw"));
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "file";
}
