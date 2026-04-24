#!/usr/bin/env python3
"""Scan toàn KB cho 3 loại trùng lặp:
1. Exact content (sha256 body trùng)
2. Near-title (title similarity > 0.88)
3. Content overlap (Jaccard tokens > 0.6)

Usage:
    python3 scripts/scan-kb-duplicates.py              # print summary
    python3 scripts/scan-kb-duplicates.py --json       # output JSON
    python3 scripts/scan-kb-duplicates.py --apply      # deprecate duplicates đề xuất

Chỉ deprecate "exact content" tự động. Near-title + content overlap
chỉ report — admin quyết thủ công.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterator

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
KB_DIR = REPO_ROOT / "knowledge"


@dataclass
class Doc:
    id: str
    path: Path
    rel_path: str
    title: str
    status: str
    body: str
    body_sha: str = ""
    tokens: set[str] = field(default_factory=set)


def tokenize(s: str) -> set[str]:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")
    return set(t for t in re.split(r"[^a-z0-9]+", s) if len(t) >= 3)


def norm_title(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def load_docs() -> list[Doc]:
    out = []
    for md in KB_DIR.rglob("*.md"):
        if md.name == "README.md":
            continue
        try:
            raw = md.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", raw, re.DOTALL)
        if not m:
            continue
        fm_raw, body = m.group(1), m.group(2)
        try:
            fm = yaml.safe_load(fm_raw) or {}
        except yaml.YAMLError:
            continue
        if not fm.get("id"):
            continue
        body_norm = re.sub(r"\s+", " ", body).strip()
        out.append(
            Doc(
                id=str(fm["id"]),
                path=md,
                rel_path=md.relative_to(KB_DIR).as_posix(),
                title=str(fm.get("title", "")),
                status=str(fm.get("status", "approved")),
                body=body,
                body_sha=hashlib.sha256(body_norm.encode("utf-8")).hexdigest(),
                tokens=tokenize(body[:4000]),
            )
        )
    return out


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def title_sim(a: str, b: str) -> float:
    na, nb = norm_title(a), norm_title(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


@dataclass
class DupeGroup:
    kind: str  # "exact" | "title" | "content"
    docs: list[Doc] = field(default_factory=list)
    similarity: float = 0.0
    canonical: Doc | None = None

    def summary(self) -> dict:
        return {
            "kind": self.kind,
            "similarity": round(self.similarity, 3),
            "canonical": self.canonical.rel_path if self.canonical else None,
            "duplicates": [
                {"path": d.rel_path, "title": d.title, "status": d.status}
                for d in self.docs
                if d is not self.canonical
            ],
        }


def find_exact_dupes(docs: list[Doc]) -> list[DupeGroup]:
    by_hash: dict[str, list[Doc]] = {}
    for d in docs:
        if d.status == "deprecated":
            continue
        by_hash.setdefault(d.body_sha, []).append(d)
    groups = []
    for h, docs_g in by_hash.items():
        if len(docs_g) < 2:
            continue
        # canonical = longest body
        docs_g.sort(key=lambda d: len(d.body), reverse=True)
        groups.append(
            DupeGroup(
                kind="exact",
                docs=docs_g,
                similarity=1.0,
                canonical=docs_g[0],
            )
        )
    return groups


def find_title_dupes(
    docs: list[Doc], threshold: float, already_grouped: set[str]
) -> list[DupeGroup]:
    """Bắt cặp title tương tự (linear O(n^2) OK cho ~1k docs)."""
    groups: list[list[Doc]] = []
    active = [d for d in docs if d.status != "deprecated" and d.id not in already_grouped]
    for d in active:
        placed = False
        for g in groups:
            if title_sim(d.title, g[0].title) >= threshold:
                g.append(d)
                placed = True
                break
        if not placed:
            groups.append([d])
    out = []
    for g in groups:
        if len(g) < 2:
            continue
        g.sort(key=lambda d: len(d.body), reverse=True)
        sim = min(title_sim(g[0].title, o.title) for o in g[1:])
        out.append(
            DupeGroup(kind="title", docs=g, similarity=sim, canonical=g[0])
        )
    return out


def find_content_dupes(
    docs: list[Doc], threshold: float, already_grouped: set[str]
) -> list[DupeGroup]:
    """Jaccard bodies — O(n^2) chấp nhận được cho KB vài trăm docs."""
    active = [d for d in docs if d.status != "deprecated" and d.id not in already_grouped]
    pairs = []
    for i, a in enumerate(active):
        for b in active[i + 1 :]:
            s = jaccard(a.tokens, b.tokens)
            if s >= threshold:
                pairs.append((s, a, b))
    pairs.sort(key=lambda x: -x[0])

    seen: set[str] = set()
    groups = []
    for s, a, b in pairs:
        if a.id in seen or b.id in seen:
            continue
        canonical = a if len(a.body) >= len(b.body) else b
        groups.append(
            DupeGroup(
                kind="content",
                docs=[a, b],
                similarity=s,
                canonical=canonical,
            )
        )
        seen.add(a.id)
        seen.add(b.id)
    return groups


def render_md_deprecate(d: Doc, reason: str) -> str:
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", d.path.read_text(encoding="utf-8"), re.DOTALL)
    if not m:
        return d.path.read_text(encoding="utf-8")
    fm = yaml.safe_load(m.group(1)) or {}
    fm["status"] = "deprecated"
    body = m.group(2).rstrip() + "\n\n" + reason + "\n"
    yaml_str = yaml.safe_dump(fm, sort_keys=False, allow_unicode=True).strip()
    return f"---\n{yaml_str}\n---\n\n{body}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--title-threshold", type=float, default=0.85)
    parser.add_argument("--content-threshold", type=float, default=0.6)
    args = parser.parse_args()

    docs = load_docs()
    print(f"Scanning {len(docs)} docs in {KB_DIR}", file=sys.stderr)

    exact = find_exact_dupes(docs)
    already_in_exact = {d.id for g in exact for d in g.docs}

    title = find_title_dupes(docs, args.title_threshold, already_in_exact)
    already_title = already_in_exact | {d.id for g in title for d in g.docs}

    content = find_content_dupes(docs, args.content_threshold, already_title)

    if args.json:
        print(json.dumps(
            {
                "exact": [g.summary() for g in exact],
                "title": [g.summary() for g in title],
                "content": [g.summary() for g in content],
            },
            ensure_ascii=False,
            indent=2,
        ))
        return 0

    print(f"\n=== Exact duplicates (body hash match) — {len(exact)} groups ===")
    for g in exact:
        print(f"  canonical: {g.canonical.rel_path}")
        for d in g.docs[1:]:
            print(f"    dup: {d.rel_path}")

    print(f"\n=== Near-title duplicates (sim ≥ {args.title_threshold}) — {len(title)} groups ===")
    for g in title:
        print(f"  canonical: {g.canonical.rel_path}  (sim={g.similarity:.2f})")
        for d in g.docs[1:]:
            print(f"    '{d.title[:60]}' → {d.rel_path}")

    print(f"\n=== Content overlap (Jaccard ≥ {args.content_threshold}) — {len(content)} pairs ===")
    for g in content:
        a, b = g.docs
        print(f"  {g.similarity:.2f}  {a.rel_path}")
        print(f"    vs  {b.rel_path}")

    if not args.apply:
        print("\n(thêm --apply để deprecate exact dupes tự động; title/content cần admin review)")
        return 0

    # Chỉ auto-deprecate exact; title + content report để admin quyết
    applied = 0
    for g in exact:
        for d in g.docs:
            if d is g.canonical:
                continue
            note = (
                f"> **Deprecated exact-dupe** — {time.strftime('%Y-%m-%d')}: "
                f"cùng content (sha256) với `{g.canonical.rel_path}`"
            )
            d.path.write_text(render_md_deprecate(d, note), encoding="utf-8")
            applied += 1
    KB_DIR.touch()
    print(f"\nDeprecated {applied} exact duplicates. Title/content groups cần admin review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
