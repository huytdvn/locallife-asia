#!/usr/bin/env python3
"""Review bot — flag tài liệu quá hạn review (last_reviewed > 90 days).

Chạy nightly qua GitHub Actions. Cho mỗi doc quá hạn, tạo 1 GitHub Issue
(hoặc cập nhật issue đã có) với mention owner, link tới file.

Env cần:
  KNOWLEDGE_DIR          (mặc định ./knowledge)
  KNOWLEDGE_REPO_OWNER
  KNOWLEDGE_REPO_NAME
  GITHUB_TOKEN           (cần scope issues:write)
  REVIEW_THRESHOLD_DAYS  (mặc định 90)

Dry-run mặc định. `--apply` để thực tạo issue.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterator

import urllib.request
import urllib.error
import json

FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


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


def walk(root: Path) -> Iterator[Path]:
    for p in root.rglob("*.md"):
        if p.name != "README.md":
            yield p


def gh_request(method: str, path: str, token: str, body: dict | None = None) -> dict:
    url = f"https://api.github.com{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if body:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())


def create_issue(owner: str, repo: str, token: str, title: str, body: str, labels: list[str]) -> dict:
    return gh_request(
        "POST",
        f"/repos/{owner}/{repo}/issues",
        token,
        {"title": title, "body": body, "labels": labels},
    )


def find_existing_issue(owner: str, repo: str, token: str, title: str) -> int | None:
    # Simple search: issues with label "review-overdue" + matching title.
    path = f"/repos/{owner}/{repo}/issues?state=open&labels=review-overdue&per_page=100"
    items = gh_request("GET", path, token)
    if not isinstance(items, list):
        return None
    for it in items:
        if it.get("title") == title:
            return int(it.get("number", 0))
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    kb = Path(os.environ.get("KNOWLEDGE_DIR", "./knowledge")).resolve()
    owner = os.environ.get("KNOWLEDGE_REPO_OWNER", "huytdvn")
    repo = os.environ.get("KNOWLEDGE_REPO_NAME", "locallife-asia")
    token = os.environ.get("GITHUB_TOKEN", "")
    threshold = int(os.environ.get("REVIEW_THRESHOLD_DAYS", "90"))

    if not kb.exists():
        print(f"[review-bot] KB not found: {kb}", file=sys.stderr)
        return 1

    cutoff = date.today() - timedelta(days=threshold)
    overdue: list[tuple[Path, date, dict[str, str]]] = []
    for p in walk(kb):
        raw = p.read_text(encoding="utf-8")
        fm = parse_fm(raw)
        if fm.get("status") == "deprecated":
            continue
        lr = fm.get("last_reviewed")
        if not lr:
            continue
        try:
            lr_d = datetime.strptime(lr, "%Y-%m-%d").date()
        except ValueError:
            continue
        if lr_d < cutoff:
            overdue.append((p, lr_d, fm))

    print(f"[review-bot] kb={kb} overdue={len(overdue)} (threshold {threshold}d)")
    for p, lr, fm in overdue:
        rel = p.relative_to(kb)
        age = (date.today() - lr).days
        print(f"  {rel}  last_reviewed={lr} ({age}d ago)  owner={fm.get('owner', '?')}")

    if not args.apply:
        print("[review-bot] dry-run; --apply để tạo Issue thật")
        return 0
    if not token:
        print("[review-bot] GITHUB_TOKEN missing; cần để tạo Issue", file=sys.stderr)
        return 2

    created = skipped = 0
    for p, lr, fm in overdue:
        rel = p.relative_to(kb)
        age = (date.today() - lr).days
        title = f"[review] Quá hạn review: {rel}"
        existing = find_existing_issue(owner, repo, token, title)
        if existing is not None:
            skipped += 1
            continue
        body = (
            f"**File**: `{rel}`\n"
            f"**Owner**: {fm.get('owner', '?')}\n"
            f"**Last reviewed**: {lr} ({age} ngày trước)\n\n"
            f"Vui lòng review nội dung, cập nhật `last_reviewed` nếu OK, "
            f"hoặc chuyển `status: deprecated` nếu không còn dùng."
        )
        create_issue(owner, repo, token, title, body, ["review-overdue"])
        created += 1
    print(f"[review-bot] created={created} skipped(existing)={skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
