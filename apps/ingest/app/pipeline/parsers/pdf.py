"""PDF parser — pdfplumber. Trích text + tables đơn giản.

Phase 3+ có thể swap sang `unstructured` hoặc Gemini Vision để handle
scan-PDF / layout phức tạp; hiện tại pdfplumber đủ cho PDF digital.
"""

from __future__ import annotations

from pathlib import Path

from app.pipeline.parsers import ParsedDoc


def parse(path: Path) -> ParsedDoc:
    import pdfplumber  # lazy import

    text_parts: list[str] = []
    tables: list[list[list[str]]] = []

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text_parts.append(page_text)
            for t in page.extract_tables() or []:
                rows = [[cell or "" for cell in row] for row in t]
                if rows:
                    tables.append(rows)

    return ParsedDoc(
        text="\n\n".join(p for p in text_parts if p.strip()),
        tables=tables,
        metadata={"source_type": "pdf", "pages": str(len(text_parts))},
    )
