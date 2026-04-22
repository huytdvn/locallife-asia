"""Normalize: ParsedDoc → markdown body sạch + bảng inline.

Luật:
- Thu gọn nhiều dòng trống liên tục.
- Trim trailing whitespace.
- Bảng Markdown với header dòng đầu.
- Không đổi chữ/dấu tiếng Việt.
"""

from __future__ import annotations

import re

from app.pipeline.parsers import ParsedDoc


def normalize(parsed: ParsedDoc) -> str:
    text = parsed.text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    parts: list[str] = [text] if text else []

    for idx, rows in enumerate(parsed.tables, 1):
        parts.append(f"### Bảng {idx}")
        parts.append(_table_to_md(rows))

    return "\n\n".join(parts).strip() + "\n"


def _table_to_md(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    header = rows[0]
    body = rows[1:] if len(rows) > 1 else []
    head_line = "| " + " | ".join(_escape(c) for c in header) + " |"
    sep_line = "| " + " | ".join("---" for _ in header) + " |"
    body_lines = [
        "| " + " | ".join(_escape(c) for c in row) + " |" for row in body
    ]
    return "\n".join([head_line, sep_line, *body_lines])


def _escape(cell: str) -> str:
    return cell.replace("\n", " ").replace("|", "\\|")
