#!/usr/bin/env python3
"""
Sync tier 2 (local server knowledge/) → tier 3 (R2 archive, object-locked).

Logic:
  - Walk $KNOWLEDGE_DIR tìm mọi .md có front-matter.
  - Với mỗi doc, key R2 = "{id}/{sha256-of-content}.md" (content-addressed).
  - Nếu key đã tồn tại → skip (immutable, không ghi đè — là điểm của object-lock).
  - Nếu chưa tồn tại → PUT với object-lock retention theo sensitivity:
      * restricted: R2_OBJECT_LOCK_YEARS_RESTRICTED (mặc định 10)
      * internal:   R2_OBJECT_LOCK_YEARS_INTERNAL (3)
      * public:     R2_OBJECT_LOCK_YEARS_PUBLIC (1)

Skip gracefully khi thiếu R2 creds — in lại kế hoạch để audit.

Chạy:
  python3 scripts/sync-to-r2.py                 # dry-run mặc định
  python3 scripts/sync-to-r2.py --apply         # thực thi
  python3 scripts/sync-to-r2.py --since <sha>   # chỉ sync docs thay đổi từ commit
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

KB_DIR = Path(os.environ.get("KNOWLEDGE_DIR", "./knowledge")).resolve()
BUCKET = os.environ.get("R2_BUCKET_KB_ARCHIVE", "locallife-kb-archive")
RET_RESTRICTED = int(os.environ.get("R2_OBJECT_LOCK_YEARS_RESTRICTED", "10"))
RET_INTERNAL = int(os.environ.get("R2_OBJECT_LOCK_YEARS_INTERNAL", "3"))
RET_PUBLIC = int(os.environ.get("R2_OBJECT_LOCK_YEARS_PUBLIC", "1"))

FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


@dataclass
class Doc:
    path: Path
    id: str
    sensitivity: str
    content_sha: str
    body: bytes


def parse_fm(text: str) -> dict[str, str]:
    m = FM_RE.match(text)
    if not m:
        return {}
    out: dict[str, str] = {}
    for line in m.group(1).splitlines():
        mm = re.match(r"^([A-Za-z_][A-Za-z0-9_]*):\s*(.+?)\s*$", line)
        if mm:
            out[mm.group(1)] = mm.group(2).strip().strip("\"'")
    return out


def iter_docs(root: Path) -> Iterator[Doc]:
    for p in root.rglob("*.md"):
        if p.name == "README.md":
            continue
        raw = p.read_bytes()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        fm = parse_fm(text)
        doc_id = fm.get("id")
        if not doc_id:
            continue
        yield Doc(
            path=p,
            id=doc_id,
            sensitivity=fm.get("sensitivity", "internal"),
            content_sha=hashlib.sha256(raw).hexdigest(),
            body=raw,
        )


def retention_years(sensitivity: str) -> int:
    return {
        "restricted": RET_RESTRICTED,
        "internal": RET_INTERNAL,
        "public": RET_PUBLIC,
    }.get(sensitivity, RET_INTERNAL)


def make_boto_client():
    try:
        import boto3  # type: ignore
    except ImportError:
        print("[sync-to-r2] boto3 not installed; run `pip install boto3` to enable real upload", file=sys.stderr)
        return None
    account = os.environ.get("R2_ACCOUNT_ID")
    key = os.environ.get("R2_ACCESS_KEY_ID")
    secret = os.environ.get("R2_SECRET_ACCESS_KEY")
    if not (account and key and secret):
        print("[sync-to-r2] R2 creds missing; run in plan mode only", file=sys.stderr)
        return None
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        region_name="auto",
    )


def object_exists(client, bucket: str, key: str) -> bool:
    from botocore.exceptions import ClientError  # type: ignore

    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchKey"):
            return False
        raise


def put_immutable(client, bucket: str, key: str, body: bytes, years: int) -> None:
    retain_until = datetime.now(timezone.utc) + timedelta(days=365 * years)
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType="text/markdown; charset=utf-8",
        ObjectLockMode="COMPLIANCE",
        ObjectLockRetainUntilDate=retain_until,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="thực thi upload (mặc định dry-run)")
    args = parser.parse_args()

    if not KB_DIR.exists():
        print(f"[sync-to-r2] knowledge dir not found: {KB_DIR}", file=sys.stderr)
        return 1

    client = make_boto_client() if args.apply else None

    plan: list[tuple[str, str, int, Path]] = []
    for doc in iter_docs(KB_DIR):
        key = f"{doc.id}/{doc.content_sha}.md"
        years = retention_years(doc.sensitivity)
        plan.append((key, doc.sensitivity, years, doc.path))

    plan.sort()
    print(f"[sync-to-r2] knowledge_dir={KB_DIR} bucket={BUCKET} docs={len(plan)}")
    uploaded = skipped = 0

    for key, sens, years, path in plan:
        if client is None:
            print(f"  PLAN  {key}  sens={sens} retain={years}y  <- {path.relative_to(KB_DIR)}")
            continue

        if object_exists(client, BUCKET, key):
            skipped += 1
            continue

        put_immutable(client, BUCKET, key, path.read_bytes(), years)
        uploaded += 1
        print(f"  PUT   {key}  sens={sens} retain={years}y")

    if client is not None:
        print(f"[sync-to-r2] done: uploaded={uploaded} skipped={skipped}")
    else:
        print("[sync-to-r2] dry-run only; re-run với --apply và R2 creds để upload")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
