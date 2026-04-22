#!/usr/bin/env python3
"""Demo pipeline ingestion — pure Python stdlib, chạy ngay không cần cài gì.

Mô phỏng 3 bước đầu của pipeline thật (parse → normalize → frontmatter) để
bạn thấy **input raw → output markdown + YAML front-matter** trông thế nào.

Các bước còn lại (commit qua GitHub API, embed Voyage-3 → Qdrant) bị lược
vì cần infra thật. Xem docs/ingestion.md cho giao thức đầy đủ.

Cách dùng:
    python3 scripts/demo-pipeline.py scripts/sample-raw/sop-booking.txt
    python3 scripts/demo-pipeline.py scripts/sample-raw/sop-booking.txt --audience lead,admin --sensitivity internal
"""

from __future__ import annotations

import argparse
import re
import secrets
import sys
import time
import unicodedata
from datetime import date
from pathlib import Path


# ── Bước 1: "parse" giả lập ────────────────────────────────────────────────
# Parser thật (apps/ingest/app/pipeline/parsers/pdf.py, image.py...) trả
# về {text, tables, metadata}. Ở demo chỉ đọc text thuần.
def parse(path: Path) -> dict:
    return {
        "text": path.read_text(encoding="utf-8"),
        "tables": [],
        "metadata": {"source_path": str(path), "source_type": "manual"},
    }


# ── Bước 2: normalize ──────────────────────────────────────────────────────
# - Dọn whitespace
# - Phát hiện title (dòng IN HOA đầu tiên, hoặc dòng đầu tiên không rỗng)
# - Phát hiện heading số (1. FOO → ## 1. Foo)
# - Loại dòng rác (footer "Phiên bản X", "Người soạn:"...)
def normalize(text: str) -> dict:
    lines = [ln.rstrip() for ln in text.splitlines()]

    # Tìm title: dòng không rỗng đầu tiên
    title = ""
    for ln in lines:
        if ln.strip():
            title = ln.strip()
            break

    # Nếu title IN HOA thì chuyển sang Title Case tiếng Việt nhẹ nhàng
    if title and title == title.upper():
        title = _vietnamese_title_case(title)

    # Phát hiện heading: dòng bắt đầu bằng "N." hoặc "N.M" + text IN HOA
    out_lines: list[str] = []
    out_lines.append(f"# {title}")
    out_lines.append("")

    section_re = re.compile(r"^(\d+)\.\s+(.+)$")
    subsection_re = re.compile(r"^Bước\s+(\d+\.\d+)\s*-\s*(.+)$")

    seen_title = False
    for ln in lines:
        stripped = ln.strip()
        if not seen_title and stripped == title.upper():
            seen_title = True
            continue
        if stripped == title:
            seen_title = True
            continue

        # Ẩn metadata footer (áp dụng khi AI sẽ đưa vào front-matter)
        if stripped.lower().startswith(("người soạn:", "duyệt:", "phiên bản")):
            continue
        if stripped.lower().startswith("phòng ban:"):
            continue

        m = section_re.match(stripped)
        if m:
            num, rest = m.group(1), m.group(2)
            out_lines.append(f"## {num}. {_vietnamese_title_case(rest)}")
            out_lines.append("")
            continue

        m2 = subsection_re.match(stripped)
        if m2:
            num, rest = m2.group(1), m2.group(2)
            out_lines.append(f"### Bước {num} — {rest}")
            out_lines.append("")
            continue

        out_lines.append(ln)

    # Gộp nhiều dòng trống liên tiếp thành 1
    collapsed: list[str] = []
    blank = False
    for ln in out_lines:
        if ln.strip() == "":
            if blank:
                continue
            blank = True
        else:
            blank = False
        collapsed.append(ln)

    body = "\n".join(collapsed).strip() + "\n"

    return {"title": title.rstrip(".:"), "body": body}


def _vietnamese_title_case(s: str) -> str:
    """Sentence case cho tiêu đề ALL CAPS.

    Heuristic thô để demo. Prod thật sẽ gọi Haiku AI soạn lại tiêu đề
    chuẩn mực (có viết hoa riêng khi là danh từ riêng).
    """
    if not s:
        return s
    # Giữ các viết tắt ngắn: SOP, LL, VND, OTA, CS
    short_acronyms = {"SOP", "LL", "VND", "OTA", "CS", "HR", "OPS"}
    words = s.split()
    result: list[str] = []
    for i, w in enumerate(words):
        if w in short_acronyms:
            result.append(w)
        elif i == 0:
            # Chữ đầu câu viết hoa
            result.append(w[:1].upper() + w[1:].lower())
        else:
            # Các từ còn lại viết thường (Vietnamese doesn't title-case)
            result.append(w.lower())
    return " ".join(result)


# ── Bước 3: front-matter ───────────────────────────────────────────────────
# - Sinh ULID
# - Tags gợi ý dựa keyword (trong prod thật: Haiku AI suggest)
# - audience/sensitivity lấy từ args hoặc default
def build_frontmatter(
    *,
    title: str,
    body: str,
    owner: str,
    audience: list[str],
    sensitivity: str,
    tags: list[str] | None,
    source_path: str,
    source_type: str,
) -> str:
    ulid = _ulid()
    today = date.today().isoformat()
    tags_final = tags or _suggest_tags(title, body)

    fm = [
        "---",
        f"id: {ulid}",
        f'title: "{title}"',
        f"owner: {owner}",
        f"audience: [{', '.join(audience)}]",
        f"sensitivity: {sensitivity}",
        f"tags: [{', '.join(tags_final)}]",
        "source:",
        f"  - type: {source_type}",
        f"    path: {source_path}",
        f"    captured_at: {today}",
        f"last_reviewed: {today}",
        f"reviewer: {owner}",
        "status: draft",
        "related: []",
        "---",
        "",
    ]
    return "\n".join(fm) + body


def _ulid() -> str:
    """Sinh ULID đơn giản bằng stdlib: 48 bit timestamp + 80 bit random, base32."""
    alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    ts = int(time.time() * 1000)
    rnd = secrets.randbits(80)
    n = (ts << 80) | rnd
    out = ""
    for _ in range(26):
        out = alphabet[n & 0x1F] + out
        n >>= 5
    return out


def _suggest_tags(title: str, body: str) -> list[str]:
    """Heuristic rất đơn giản. Prod thật: Haiku AI suggest từ context + taxonomy."""
    text = (title + " " + body).lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))

    keywords = {
        "sop": ["sop", "quy trinh", "process"],
        "booking": ["booking", "dat cho"],
        "operations": ["van hanh", "ops"],
        "homestay": ["homestay"],
        "onboarding": ["onboarding", "nhap tich"],
        "refund": ["hoan tien", "huy"],
        "hr": ["nhan su", "nghi phep"],
        "partner": ["doi tac", "nghe nhan"],
    }
    found = [tag for tag, kws in keywords.items() if any(kw in text for kw in kws)]
    return found or ["uncategorized"]


# ── CLI ────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="Demo pipeline ingest (stdlib only)")
    ap.add_argument("path", help="đường dẫn file raw (txt trong demo này)")
    ap.add_argument("--owner", default="ops@locallife.asia")
    ap.add_argument("--audience", default="employee,lead,admin",
                    help="comma-separated: employee,lead,admin")
    ap.add_argument("--sensitivity", default="internal",
                    choices=["public", "internal", "restricted"])
    ap.add_argument("--tags", default="", help="comma-separated, bỏ trống để AI đoán")
    ap.add_argument("--out", default="-", help="file output, hoặc - cho stdout")
    args = ap.parse_args()

    src = Path(args.path)
    if not src.exists():
        print(f"File không tồn tại: {src}", file=sys.stderr)
        return 1

    _banner(f"BƯỚC 1 — PARSE: {src}")
    raw = parse(src)
    print(f"  text: {len(raw['text'])} ký tự, {len(raw['text'].splitlines())} dòng")
    print(f"  tables: {len(raw['tables'])}")
    print(f"  metadata: {raw['metadata']}")

    _banner("BƯỚC 2 — NORMALIZE")
    norm = normalize(raw["text"])
    print(f"  title phát hiện: {norm['title']}")
    print(f"  body: {len(norm['body'].splitlines())} dòng markdown")

    _banner("BƯỚC 3 — FRONT-MATTER + OUTPUT")
    tags = [t.strip() for t in args.tags.split(",") if t.strip()] or None
    audience = [a.strip() for a in args.audience.split(",") if a.strip()]
    md = build_frontmatter(
        title=norm["title"].rstrip(".:"),
        body=norm["body"],
        owner=args.owner,
        audience=audience,
        sensitivity=args.sensitivity,
        tags=tags,
        source_path=raw["metadata"]["source_path"],
        source_type=raw["metadata"]["source_type"],
    )

    if args.out == "-":
        print()
        print("=" * 72)
        print(md)
    else:
        Path(args.out).write_text(md, encoding="utf-8")
        print(f"  → ghi ra {args.out}")

    _banner("BƯỚC KẾ TIẾP (không chạy trong demo)")
    print("  4. COMMIT: POST tới GitHub API → PR tới locallife-knowledge")
    print("  5. EMBED:  Voyage-3 → upsert Qdrant khi PR merge")
    print("  6. INDEX:  Postgres tsvector (BM25) đồng bộ từ webhook")

    return 0


def _banner(text: str) -> None:
    print()
    print(f"── {text} ".ljust(72, "─"))


if __name__ == "__main__":
    sys.exit(main())
