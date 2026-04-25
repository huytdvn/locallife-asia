"""Parsers: bytes/path → ParsedDoc(text, tables, metadata).

Mỗi parser tự handle format riêng. Trả về cùng shape để pipeline downstream
(normalize, frontmatter) không cần biết format gốc.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ParsedDoc:
    text: str
    tables: list[list[list[str]]] = field(default_factory=list)
    metadata: dict[str, str] = field(default_factory=dict)


def parse_file(path: Path) -> ParsedDoc:
    """Route theo extension → parser phù hợp.

    Raises ValueError nếu extension không support.
    """
    ext = path.suffix.lower().lstrip(".")
    if ext == "pdf":
        from app.pipeline.parsers import pdf

        return pdf.parse(path)
    if ext == "docx":
        from app.pipeline.parsers import docx

        return docx.parse(path)
    if ext == "xlsx":
        from app.pipeline.parsers import xlsx

        return xlsx.parse(path)
    if ext == "csv":
        from app.pipeline.parsers import csv

        return csv.parse(path)
    if ext in ("png", "jpg", "jpeg", "webp", "tif", "tiff"):
        from app.pipeline.parsers import image

        return image.parse(path)
    if ext in ("md", "txt"):
        return ParsedDoc(text=path.read_text(encoding="utf-8"))
    raise ValueError(f"Định dạng không hỗ trợ: .{ext}")
