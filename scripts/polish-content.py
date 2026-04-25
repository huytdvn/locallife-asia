#!/usr/bin/env python3
"""Polish tất cả docs trong KB: Gemini viết lại markdown cho sạch + structure.

Giữ 100% dữ liệu + ý nghĩa, CHỈ sửa trình bày:
- OCR artifacts / typos
- Thêm H1/H2/H3 phân tầng
- Bullet/bảng khi cần
- Rút gọn câu rườm rà
- Giữ số liệu, tên người, mã hợp đồng, email nguyên văn

Không đụng FM (id/audience/sensitivity/status vẫn giữ).

Usage:
    python3 scripts/polish-content.py                    # dry-run, in diff 1 doc
    python3 scripts/polish-content.py --apply            # polish tất cả
    python3 scripts/polish-content.py --apply --only internal   # filter
    python3 scripts/polish-content.py --skip-seed        # bỏ qua 11 seed docs
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import time
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
KB_DIR = REPO_ROOT / "knowledge"

POLISH_PROMPT = """Bạn là biên tập viên kỹ thuật của Local Life Asia. Hãy POLISH markdown sau theo quy tắc tuyệt đối:

GIỮ NGUYÊN 100%:
- Toàn bộ dữ liệu: số tiền, %, ngày tháng, tên người, email, số điện thoại, mã hợp đồng
- Nghĩa / logic các câu
- Thứ tự các mục lớn

CHỈ SỬA:
- Lỗi chính tả, dấu tiếng Việt sai
- Whitespace thừa, xuống dòng lạ (từ OCR)
- Thêm # H1 cho tiêu đề chính (1 cái duy nhất đầu file)
- Thêm ## H2, ### H3 để phân mục rõ ràng
- Chuyển danh sách gạch đầu dòng dạng text thành - bullet thực sự
- Chuyển bảng text-align thủ công thành | Markdown table nếu có thể
- Rút câu rườm rà (vd "có thể nói rằng" → bỏ)
- Thêm blockquote (>) cho các ghi chú quan trọng
- Chuẩn hoá **bold** cho key terms

KHÔNG ĐƯỢC:
- Bịa thông tin
- Rewrite ý nghĩa
- Xoá section
- Thêm front-matter (FM đã có sẵn, KHÔNG trả về FM)

Trả về CHỈ markdown đã polish, không giải thích. Không có header ```markdown``` wrap."""


def load_fm_and_body(path: Path) -> tuple[dict, str] | None:
    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", raw, re.DOTALL)
    if not m:
        return None
    try:
        fm = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError:
        return None
    if not fm.get("id"):
        return None
    return fm, m.group(2)


def write_back(path: Path, fm: dict, body: str) -> None:
    yaml_str = yaml.safe_dump(fm, sort_keys=False, allow_unicode=True).strip()
    content = f"---\n{yaml_str}\n---\n\n{body.rstrip()}\n"
    path.write_text(content, encoding="utf-8")


def polish_one(client, model: str, title: str, body: str) -> str:
    if len(body) < 100:
        return body  # too short, không cần polish
    excerpt = body[:15000]
    resp = client.models.generate_content(
        model=model,
        contents=[POLISH_PROMPT, f"Tiêu đề: {title}\n\nMarkdown hiện tại:\n---\n{excerpt}\n---"],
    )
    out = (resp.text or "").strip()
    # Defensive: nếu Gemini trả ```markdown``` wrapper, strip nó
    out = re.sub(r"^```(?:markdown|md)?\s*\n", "", out)
    out = re.sub(r"\n```\s*$", "", out)
    return out.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--only", default=None, help="prefix rel_path để filter")
    parser.add_argument("--skip-seed", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="giới hạn số doc (0 = tất cả)")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY") or _read_env_key()
    if not api_key:
        print("ERROR: GEMINI_API_KEY missing", file=sys.stderr)
        return 2
    from google import genai

    client = genai.Client(api_key=api_key)
    model = os.environ.get("GEMINI_MODEL_CHAT", "gemini-2.5-flash")

    files = []
    for p in sorted(KB_DIR.rglob("*.md")):
        if p.name == "README.md":
            continue
        rel = p.relative_to(KB_DIR).as_posix()
        if args.only and not rel.startswith(args.only):
            continue
        files.append(p)

    if args.skip_seed:
        files = [p for p in files if "01HM9A" not in p.read_text(encoding="utf-8")[:400]]

    if args.limit:
        files = files[: args.limit]

    print(f"Loaded {len(files)} docs to polish (model={model}, apply={args.apply})")

    ok = skip = fail = 0
    for i, p in enumerate(files, 1):
        parsed = load_fm_and_body(p)
        if not parsed:
            print(f"[{i:3d}/{len(files)}] SKIP (no FM): {p.relative_to(KB_DIR)}")
            skip += 1
            continue
        fm, body = parsed
        if fm.get("status") == "deprecated":
            print(f"[{i:3d}/{len(files)}] SKIP (deprecated): {p.relative_to(KB_DIR)}")
            skip += 1
            continue
        title = fm.get("title", "")
        print(f"[{i:3d}/{len(files)}] polish: {title[:60]}")
        try:
            new_body = polish_one(client, model, title, body)
            if args.apply:
                write_back(p, fm, new_body)
            else:
                # Dry: chỉ in diff length
                print(f"      dry: {len(body)} → {len(new_body)} chars")
            ok += 1
            time.sleep(0.4)  # rate-limit
        except Exception as e:
            print(f"      FAIL: {e}", file=sys.stderr)
            fail += 1
            continue

    if args.apply:
        KB_DIR.touch()

    print(f"\nDone. polished={ok} skipped={skip} failed={fail}")
    return 0


def _read_env_key() -> str | None:
    envp = REPO_ROOT / ".env.local"
    if not envp.exists():
        return None
    for line in envp.read_text().splitlines():
        m = re.match(r"^GEMINI_API_KEY=([^#\s]+)", line)
        if m:
            return m.group(1).strip()
    return None


if __name__ == "__main__":
    raise SystemExit(main())
