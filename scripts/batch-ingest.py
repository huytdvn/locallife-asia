#!/usr/bin/env python3
"""Batch upload tất cả file support từ 1 thư mục → ingest API.

Dùng Python thay bash để handle đúng filename có ký tự đặc biệt
(`,` `;` `&` `–` `[]` Vietnamese NFD) mà curl -F có thể parse sai.

Usage:
    python3 scripts/batch-ingest.py /path/to/source [owner@email]
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import json
import urllib.request
import urllib.error
import mimetypes
import uuid

SUPPORTED = {"pdf", "docx", "xlsx", "csv", "md", "txt", "png", "jpg", "jpeg", "webp", "tif", "tiff"}


def read_env_token(env_path: Path) -> str:
    if not env_path.exists():
        return ""
    for line in env_path.read_text().splitlines():
        m = re.match(r"^INGEST_API_TOKEN=(.*?)(?:\s|$)", line)
        if m:
            return m.group(1).strip()
    return ""


def multipart_encode(fields: dict[str, str], file_field: str, filepath: Path) -> tuple[bytes, str]:
    boundary = "----LLA-" + uuid.uuid4().hex
    nl = b"\r\n"
    body = bytearray()
    for k, v in fields.items():
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode()
        body += v.encode("utf-8") + nl
    mime = mimetypes.guess_type(str(filepath))[0] or "application/octet-stream"
    body += f"--{boundary}\r\n".encode()
    body += (
        f'Content-Disposition: form-data; name="{file_field}"; filename="{filepath.name}"\r\n'
    ).encode("utf-8")
    body += f"Content-Type: {mime}\r\n\r\n".encode()
    body += filepath.read_bytes() + nl
    body += f"--{boundary}--\r\n".encode()
    return bytes(body), boundary


def upload_one(
    endpoint: str,
    token: str,
    filepath: Path,
    owner: str,
) -> tuple[bool, str]:
    fields = {
        "owner": owner,
        "suggested_audience": json.dumps(["employee", "lead"]),
        "suggested_sensitivity": "internal",
        "tags": "[]",
    }
    body, boundary = multipart_encode(fields, "file", filepath)
    req = urllib.request.Request(
        f"{endpoint}/upload",
        data=body,
        method="POST",
    )
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    req.add_header("Content-Length", str(len(body)))
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
            return True, data.get("job_id", "?")[:8]
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode()[:200]
        except Exception:
            detail = str(e)
        return False, f"HTTP {e.code}: {detail}"
    except Exception as e:
        return False, str(e)[:200]


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: batch-ingest.py <source-dir> [owner]", file=sys.stderr)
        return 2
    src = Path(sys.argv[1]).resolve()
    owner = sys.argv[2] if len(sys.argv) > 2 else "ops@locallife.asia"
    endpoint = os.environ.get("INGEST_URL", "http://localhost:8001")

    repo_root = Path(__file__).resolve().parents[1]
    token = os.environ.get("INGEST_API_TOKEN") or read_env_token(repo_root / ".env.local")
    if not token:
        print("WARN: no INGEST_API_TOKEN found — may fail if ingest requires auth", file=sys.stderr)

    if not src.exists():
        print(f"ERROR: {src} not found", file=sys.stderr)
        return 2

    try:
        urllib.request.urlopen(f"{endpoint}/health", timeout=5).read()
    except Exception as e:
        print(f"ERROR: ingest not reachable: {e}", file=sys.stderr)
        return 2

    ok = fail = skip = 0
    rejected: list[tuple[Path, str]] = []
    for p in sorted(src.rglob("*")):
        if not p.is_file():
            continue
        if p.name.startswith(".") or p.name.startswith("~$"):
            skip += 1
            continue
        ext = p.suffix.lower().lstrip(".")
        if ext not in SUPPORTED:
            skip += 1
            continue

        idx = ok + fail + 1
        name = p.name
        display = name[:60] + ("…" if len(name) > 60 else "")
        print(f"[{idx:3d}] {display} ... ", end="", flush=True)

        success, detail = upload_one(endpoint, token, p, owner)
        if success:
            print(f"OK  ({detail})")
            ok += 1
        else:
            print(f"FAIL {detail[:80]}")
            rejected.append((p, detail))
            fail += 1

    print()
    print("=== Upload summary ===")
    print(f"  uploaded:          {ok}")
    print(f"  failed:            {fail}")
    print(f"  skipped:           {skip}")
    if rejected:
        print("\n=== Failed files (first 10) ===")
        for p, d in rejected[:10]:
            print(f"  {p.name[:70]}: {d[:80]}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
