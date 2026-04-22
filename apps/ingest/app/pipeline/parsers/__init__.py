"""Parsers: chuyển file thô (PDF, Word, Excel, ảnh scan) → plain text + bảng.

Mỗi parser trả về dict có keys:
  - text: str              (nội dung text liên tục)
  - tables: list[str]      (bảng đã convert sang markdown)
  - metadata: dict         (tên file gốc, kích thước, ngôn ngữ, v.v.)

Phase 0: các module là stub. Phase 2 implement thật.
"""
