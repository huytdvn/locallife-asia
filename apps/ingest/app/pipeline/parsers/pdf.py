"""PDF parser. Dùng unstructured + pdfplumber cho bảng phức tạp."""

from __future__ import annotations

from pathlib import Path
from typing import Any


def parse_pdf(path: Path) -> dict[str, Any]:
    # TODO(phase-2):
    #   - unstructured.partition.pdf(path, strategy="hi_res", infer_table_structure=True)
    #   - pdfplumber cho bảng bị unstructured parse sai
    #   - phát hiện tiếng Việt, giữ dấu Unicode chuẩn
    raise NotImplementedError("PDF parser — Phase 2")
