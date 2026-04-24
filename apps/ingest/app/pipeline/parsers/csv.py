"""CSV parser — giữ header + 200 dòng đầu, render thành markdown table."""

from __future__ import annotations

import csv as _csv
from pathlib import Path

from app.pipeline.parsers import ParsedDoc

MAX_ROWS = 200


def parse(path: Path) -> ParsedDoc:
    rows: list[list[str]] = []
    # Thử UTF-8, fallback CP1258 (tiếng Việt cũ) rồi latin-1
    for enc in ("utf-8-sig", "utf-8", "cp1258", "latin-1"):
        try:
            with path.open("r", encoding=enc, newline="") as f:
                reader = _csv.reader(f)
                for i, row in enumerate(reader):
                    rows.append(row)
                    if i >= MAX_ROWS:
                        break
            break
        except (UnicodeDecodeError, _csv.Error):
            rows = []
            continue

    tables = [rows] if rows else []
    summary = f"CSV gồm {len(rows)} dòng (tối đa hiển thị {MAX_ROWS})."
    return ParsedDoc(
        text=summary,
        tables=tables,
        metadata={"source_type": "csv"},
    )
