#!/usr/bin/env python3
"""Demo retrieval — BM25 thuần stdlib trên 11 seed doc trong knowledge/.

Mô phỏng tool `search_knowledge` mà Claude gọi trong runtime thật:
  1. Walk knowledge/ → đọc markdown + parse YAML front-matter
  2. Chunk theo H2 (overlap 0)                                  ← prod: thêm overlap 15%
  3. Tokenize tiếng Việt thô (lowercase + bỏ dấu)               ← prod: vncorenlp/underthesea
  4. Build BM25 index (k1=1.5, b=0.75)
  5. Query → top-K
  6. Hard RBAC filter qua canRead() — bắt buộc, không bypass
  7. Trả citations đúng format prod (path#heading-slug)

Cách dùng:
    python3 scripts/demo-retrieval.py "Làm sao xin nghỉ phép?"
    python3 scripts/demo-retrieval.py "công ty giữ bao nhiêu phần trăm?" --role employee
    python3 scripts/demo-retrieval.py "công ty giữ bao nhiêu phần trăm?" --role admin --top-k 3
"""

from __future__ import annotations

import argparse
import math
import re
import sys
import time
import unicodedata
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE_DIR = ROOT / "knowledge"


# ── Front-matter parser (mini, không cần pyyaml) ───────────────────────────
def parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 4)
    if end < 0:
        return {}, text
    raw = text[4:end]
    body = text[end + 4 :].lstrip("\n")
    fm: dict = {}
    current_list_key: str | None = None
    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith("  - ") and current_list_key:
            fm.setdefault(current_list_key, []).append(line[4:].strip())
            continue
        m = re.match(r"^([a-zA-Z_]+):\s*(.*)$", line)
        if not m:
            continue
        k, v = m.group(1), m.group(2).strip()
        if v == "":
            current_list_key = k
        elif v.startswith("[") and v.endswith("]"):
            inner = v[1:-1]
            fm[k] = [x.strip().strip('"') for x in inner.split(",") if x.strip()]
            current_list_key = None
        else:
            fm[k] = v.strip('"')
            current_list_key = None
    return fm, body


# ── Chunking ───────────────────────────────────────────────────────────────
@dataclass
class Chunk:
    doc_path: str
    doc_id: str
    title: str
    audience: list[str]
    sensitivity: str
    status: str
    heading: str
    text: str
    tokens: list[str]


def chunk_by_h2(body: str) -> list[tuple[str, str]]:
    """Trả [(heading, text), ...]. Phần trước H2 đầu tiên ghép vào heading 'intro'."""
    chunks: list[tuple[str, str]] = []
    current_heading = "intro"
    current_lines: list[str] = []
    for line in body.splitlines():
        m = re.match(r"^##\s+(.+)$", line)
        if m:
            if current_lines:
                chunks.append((current_heading, "\n".join(current_lines).strip()))
            current_heading = m.group(1).strip()
            current_lines = []
        else:
            current_lines.append(line)
    if current_lines:
        chunks.append((current_heading, "\n".join(current_lines).strip()))
    # Lọc chunk rỗng
    return [(h, t) for h, t in chunks if t]


# ── Tokenizer (Vietnamese, thô) ────────────────────────────────────────────
def strip_diacritics(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))


# Stopwords thô (prod: dùng list đầy đủ)
STOPWORDS = {
    "va", "la", "co", "khong", "cua", "cho", "voi", "tu", "den", "nhu", "nay",
    "do", "trong", "ngoai", "tren", "duoi", "khi", "ma", "nen", "se", "da",
    "cac", "nhung", "thi", "rang", "nao", "ai", "gi", "hay", "hoac", "neu",
    "duoc", "bi", "lam", "the", "nhieu", "it", "moi", "tat", "ca",
}


def tokenize(s: str) -> list[str]:
    s = strip_diacritics(s.lower())
    tokens = re.findall(r"[a-z0-9]+", s)
    return [t for t in tokens if len(t) > 1 and t not in STOPWORDS]


# ── RBAC (mirror apps/web/lib/rbac.ts) ─────────────────────────────────────
def audience_for(role: str) -> set[str]:
    return {
        "employee": {"employee"},
        "lead": {"employee", "lead"},
        "admin": {"employee", "lead", "admin"},
    }[role]


def can_read(role: str, doc_audience: list[str], sensitivity: str, status: str) -> bool:
    if status == "deprecated":
        return False
    if status == "draft" and role == "employee":
        return False
    if not (set(doc_audience) & audience_for(role)):
        return False
    if sensitivity == "restricted" and role == "employee":
        return False
    return True


# ── BM25 ───────────────────────────────────────────────────────────────────
class BM25:
    def __init__(self, docs: list[list[str]], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.N = len(docs)
        self.avgdl = sum(len(d) for d in docs) / max(self.N, 1)
        self.dl = [len(d) for d in docs]
        df: Counter[str] = Counter()
        self.tf: list[Counter[str]] = []
        for d in docs:
            tfd: Counter[str] = Counter(d)
            self.tf.append(tfd)
            for term in tfd:
                df[term] += 1
        self.idf = {
            term: math.log(1 + (self.N - n + 0.5) / (n + 0.5)) for term, n in df.items()
        }

    def score(self, query: list[str], idx: int) -> float:
        score = 0.0
        tfd = self.tf[idx]
        dl = self.dl[idx]
        norm = 1 - self.b + self.b * dl / max(self.avgdl, 1)
        for q in query:
            if q not in tfd:
                continue
            f = tfd[q]
            score += self.idf.get(q, 0.0) * (f * (self.k1 + 1)) / (f + self.k1 * norm)
        return score


# ── Pipeline ───────────────────────────────────────────────────────────────
def slug(s: str) -> str:
    s = strip_diacritics(s.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def load_chunks() -> list[Chunk]:
    out: list[Chunk] = []
    for md in sorted(KNOWLEDGE_DIR.rglob("*.md")):
        if md.name == "README.md":
            continue
        text = md.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(text)
        if not fm:
            continue
        rel = md.relative_to(KNOWLEDGE_DIR).as_posix()
        for heading, content in chunk_by_h2(body):
            out.append(
                Chunk(
                    doc_path=rel,
                    doc_id=fm.get("id", "?"),
                    title=fm.get("title", rel),
                    audience=fm.get("audience", ["employee"]),
                    sensitivity=fm.get("sensitivity", "internal"),
                    status=fm.get("status", "approved"),
                    heading=heading,
                    text=content,
                    tokens=tokenize(heading + " " + content),
                )
            )
    return out


def search(query: str, role: str, top_k: int) -> list[tuple[float, Chunk]]:
    chunks = load_chunks()
    bm25 = BM25([c.tokens for c in chunks])
    q_tokens = tokenize(query)

    scored = [(bm25.score(q_tokens, i), chunks[i]) for i in range(len(chunks))]
    # Sort desc, lấy top 20 trước khi RBAC filter (mô phỏng prod)
    scored.sort(key=lambda x: -x[0])
    top20 = [(s, c) for s, c in scored[:20] if s > 0]

    # Hard RBAC filter (giống canRead trong apps/web/lib/rbac.ts)
    safe = [
        (s, c)
        for s, c in top20
        if can_read(role, c.audience, c.sensitivity, c.status)
    ]
    return safe[:top_k]


# ── CLI ────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="Demo retrieval BM25 + RBAC")
    ap.add_argument("query", help="câu hỏi tiếng Việt")
    ap.add_argument("--role", default="employee", choices=["employee", "lead", "admin"])
    ap.add_argument("--top-k", type=int, default=5)
    args = ap.parse_args()

    t0 = time.perf_counter()
    chunks = load_chunks()
    t_load = (time.perf_counter() - t0) * 1000

    t1 = time.perf_counter()
    results = search(args.query, args.role, args.top_k)
    t_search = (time.perf_counter() - t1) * 1000

    print(f'Query : "{args.query}"')
    print(f"Role  : {args.role}")
    print(f"Index : {len(chunks)} chunks từ {len(set(c.doc_path for c in chunks))} docs"
          f"  (load {t_load:.0f}ms, search {t_search:.0f}ms)")
    print()

    if not results:
        print("Không tìm thấy kết quả phù hợp với role này.")
        print("(Trong AI chat thật: Claude sẽ trả 'Tôi chưa có tài liệu về việc này'"
              " và gợi ý hỏi owner phòng ban)")
        return 0

    print(f"Top-{args.top_k} kết quả (sau RBAC filter):\n")
    for i, (score, c) in enumerate(results, 1):
        excerpt = re.sub(r"\s+", " ", c.text)[:200]
        sens_badge = {
            "public": "🌐",
            "internal": "🏢",
            "restricted": "🔒",
        }.get(c.sensitivity, "?")
        print(f"  {i}. [{score:5.2f}] {sens_badge} {c.title}")
        print(f"        ↳ citation: {c.doc_path}#{slug(c.heading)}")
        print(f"        ↳ excerpt:  {excerpt}...")
        print()

    # Phần này mô phỏng những gì Claude sẽ làm tiếp
    print("─" * 72)
    print("Bước kế tiếp trong runtime thật:")
    print("  • Top-5 này (chunk + heading + path) được trả về như tool_result")
    print("  • Sonnet 4.6 đọc, tổng hợp câu trả lời tiếng Việt, có citation")
    print("  • Stream tokens về user qua SSE (~80 tok/s)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
