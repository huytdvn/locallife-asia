#!/usr/bin/env python3
"""Smart reorganize: AI re-classify inbox docs + move to dept folders
+ detect and deprecate near-duplicates.

Usage:
    python3 scripts/re-organize.py              # dry-run, print plan
    python3 scripts/re-organize.py --apply      # thực thi
    python3 scripts/re-organize.py --apply --only inbox    # chỉ process inbox
    python3 scripts/re-organize.py --apply --only 40-partners    # chỉ reclassify 1 dept
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
KB_DIR = REPO_ROOT / "knowledge"

# Taxonomy 2-cấp: zone → dept
TAXONOMY = {
    "internal": {
        "name": "Nội bộ (staff only)",
        "desc": "Tài liệu chỉ staff Local Life thấy: quy trình nội bộ, nhân sự, tài chính",
        "audience": ["employee", "lead", "admin"],
        "depts": {
            "00-company": {"name": "Công ty / Brand", "desc": "Vision, sứ mệnh, giá trị, pháp lý công ty", "subfolders": []},
            "10-hr": {"name": "Nhân sự", "desc": "Onboarding nhân viên, chính sách, biểu mẫu HR", "subfolders": ["onboarding", "policies", "forms"]},
            "20-operations": {"name": "Vận hành", "desc": "SOP nghiệp vụ nội bộ, quy trình booking/tư vấn, khủng hoảng, khiếu nại nội bộ", "subfolders": ["processes", "playbooks"]},
            "30-product": {"name": "Sản phẩm", "desc": "Tiêu chuẩn chất lượng sản phẩm nhìn từ góc nội bộ", "subfolders": ["homestay", "experiences", "marketplace"]},
            "40-partners": {"name": "Đối tác (meta)", "desc": "Hồ sơ đối tác, contract meta, partner directory", "subfolders": ["homestay-hosts", "artisans", "suppliers"]},
            "50-finance": {"name": "Tài chính & Pháp lý", "desc": "Pricing nội bộ, commission, hợp đồng bản chính, tài khoản ngân hàng, giấy tờ công ty", "subfolders": []},
        },
    },
    "host": {
        "name": "Dành cho Host partner",
        "desc": "Tài liệu host homestay/trải nghiệm tra cứu được",
        "audience": ["host", "lead", "admin"],
        "depts": {
            "onboarding": {"name": "Onboarding Host", "desc": "Quy trình để 1 host mới join platform", "subfolders": []},
            "standards": {"name": "Tiêu chuẩn chất lượng", "desc": "Tiêu chí phân cấp, đánh giá, an toàn dịch vụ host nhìn từ góc host", "subfolders": []},
            "policies": {"name": "Chính sách host", "desc": "Hủy-hoàn-đổi, thưởng phạt, tranh chấp, quyền riêng tư áp dụng cho host", "subfolders": []},
            "faq": {"name": "FAQ host", "desc": "Câu hỏi thường gặp của host", "subfolders": []},
        },
    },
    "lok": {
        "name": "Dành cho LOK partner",
        "desc": "Tài liệu chương trình LOK (Local Official Kitchen/Knowledge partner)",
        "audience": ["lok", "lead", "admin"],
        "depts": {
            "program": {"name": "Chương trình LOK", "desc": "Giới thiệu, quyền lợi, cam kết chương trình", "subfolders": []},
            "onboarding": {"name": "Onboarding LOK", "desc": "Các bước đăng ký + xác nhận", "subfolders": []},
            "training": {"name": "Đào tạo LOK", "desc": "Tài liệu training vận hành LOK", "subfolders": []},
            "faq": {"name": "FAQ LOK", "desc": "Câu hỏi thường gặp", "subfolders": []},
        },
    },
    "public": {
        "name": "Công khai",
        "desc": "Nội dung mọi user đăng nhập đều tra cứu được",
        "audience": ["employee", "lead", "admin", "host", "lok", "guest"],
        "depts": {
            "about": {"name": "Về Local Life", "desc": "Giới thiệu công ty public, sứ mệnh, đội ngũ", "subfolders": []},
            "terms": {"name": "Điều khoản công khai", "desc": "ToS, privacy, điều kiện sử dụng công khai cho khách hàng", "subfolders": []},
            "faq": {"name": "FAQ chung", "desc": "Câu hỏi thường gặp cho khách du lịch / user thường", "subfolders": []},
        },
    },
}

_tax_summary = {
    z: {
        "name": v["name"],
        "desc": v["desc"],
        "audience": v["audience"],
        "depts": {dk: {"name": dv["name"], "desc": dv["desc"], "subfolders": dv["subfolders"]} for dk, dv in v["depts"].items()},
    }
    for z, v in TAXONOMY.items()
}

CLASSIFY_PROMPT = f"""Bạn là trợ lý phân loại tài liệu nội bộ Local Life Asia.

TAXONOMY 2 cấp: zone (ai tra cứu) → dept (module).

{json.dumps(_tax_summary, ensure_ascii=False, indent=2)}

Trả về JSON duy nhất (không giải thích ngoài JSON):
{{
  "zone": "internal" | "host" | "lok" | "public",
  "dept": "<key trong depts của zone>",
  "subfolder": "<tên subfolder>" | null,
  "title": "tiêu đề ngắn gọn tiếng Việt <= 80 ký tự, viết hoa chữ đầu",
  "tags": ["3-6 tag snake_case không dấu tiếng Anh"],
  "audience": [role... ],
  "sensitivity": "public" | "internal" | "restricted",
  "quality": 1-5,
  "quality_reason": "1 câu ngắn"
}}

Nguyên tắc chọn ZONE:
- Bất kỳ doc nào host homestay/trải nghiệm tra cứu (tiêu chuẩn, onboarding, FAQ, chính sách áp dụng cho host) → zone `host`
- LOK program docs (giới thiệu, quyền lợi, onboarding LOK, training) → zone `lok`
- Giới thiệu công ty / ToS / FAQ du khách công khai → zone `public`
- Tất cả còn lại (nội bộ staff: HR, ops, finance, pháp lý nội bộ, hợp đồng bản chính) → zone `internal`

Nguyên tắc chọn DEPT trong zone:
- `internal/50-finance`: hợp đồng ký, pricing, commission, tài khoản, giấy tờ công ty bản gốc → thường `restricted` + audience `[lead, admin]`
- `internal/20-operations`: SOP, quy trình, khiếu nại nội bộ → `internal` + `[employee, lead, admin]`
- `internal/10-hr`: nhân viên, onboarding nhân viên, nghỉ phép
- `internal/30-product`: tiêu chuẩn chất lượng nhìn từ góc nội bộ
- `internal/40-partners`: hồ sơ đối tác (meta-data, không phải hướng dẫn cho đối tác)
- `host/*`: content có đối tượng là host đọc
- `lok/*`: content có đối tượng là LOK đọc

AUDIENCE rules:
- zone `internal`: audience phải ⊆ `[employee, lead, admin]`
- zone `host`: audience nên có `host` (+ optional lead/admin)
- zone `lok`: audience nên có `lok` (+ optional lead/admin)
- zone `public`: audience có thể rộng, thường tất cả

quality rubric: 5=sẵn sàng approve · 3=cần review mess · 1=gần như rác
"""


@dataclass
class DocRow:
    id: str
    path: Path  # absolute
    rel_path: str  # relative to KB_DIR
    title: str
    audience: list[str]
    sensitivity: str
    tags: list[str]
    status: str
    owner: str
    reviewer: str
    last_reviewed: str
    source: list[dict] = field(default_factory=list)
    body: str = ""


@dataclass
class Classification:
    zone: str
    dept: str
    subfolder: str | None
    title: str
    tags: list[str]
    audience: list[str]
    sensitivity: str
    quality: int
    quality_reason: str


@dataclass
class Plan:
    doc: DocRow
    cls: Classification | None
    new_rel_path: str | None
    duplicate_of: str | None  # rel_path của canonical doc nếu bị coi là duplicate
    action: str  # "keep" | "move" | "enrich" | "deprecate-duplicate"


def normalize_title(t: str) -> str:
    s = unicodedata.normalize("NFD", t.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def slugify(t: str) -> str:
    s = normalize_title(t)
    return re.sub(r"\s+", "-", s)[:70] or "untitled"


def title_similarity(a: str, b: str) -> float:
    na, nb = normalize_title(a), normalize_title(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def load_all_docs(only: str | None = None) -> list[DocRow]:
    out: list[DocRow] = []
    for md in KB_DIR.rglob("*.md"):
        if md.name == "README.md":
            continue
        rel = md.relative_to(KB_DIR).as_posix()
        if only and not rel.startswith(only):
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
        out.append(
            DocRow(
                id=str(fm["id"]),
                path=md,
                rel_path=rel,
                title=str(fm.get("title", "")),
                audience=[str(a) for a in (fm.get("audience") or [])],
                sensitivity=str(fm.get("sensitivity", "internal")),
                tags=[str(t) for t in (fm.get("tags") or [])],
                status=str(fm.get("status", "approved")),
                owner=str(fm.get("owner", "")),
                reviewer=str(fm.get("reviewer", "")),
                last_reviewed=str(fm.get("last_reviewed", "")),
                source=list(fm.get("source") or []),
                body=body,
            )
        )
    return out


def classify_via_gemini(doc: DocRow, client, model: str) -> Classification | None:
    body_excerpt = doc.body[:4000]
    prompt = f"""Tài liệu hiện tại:
- id: {doc.id}
- path: {doc.rel_path}
- title: {doc.title}
- current audience: {doc.audience}
- current sensitivity: {doc.sensitivity}
- current tags: {doc.tags}

Nội dung:
---
{body_excerpt}
---

Phân loại lại theo taxonomy đã mô tả."""
    try:
        resp = client.models.generate_content(
            model=model,
            contents=[CLASSIFY_PROMPT, prompt],
            config={"response_mime_type": "application/json"},
        )
        data = json.loads((resp.text or "").strip())
        zone = str(data.get("zone", "internal"))
        if zone not in TAXONOMY:
            zone = "internal"
        dept = str(data.get("dept", "00-company"))
        if dept not in TAXONOMY[zone]["depts"]:
            # fallback — chọn dept đầu tiên của zone
            dept = next(iter(TAXONOMY[zone]["depts"].keys()))
        return Classification(
            zone=zone,
            dept=dept,
            subfolder=data.get("subfolder") or None,
            title=str(data["title"]).strip(),
            tags=[str(t) for t in (data.get("tags") or [])],
            audience=[str(a) for a in (data.get("audience") or ["employee"])],
            sensitivity=str(data.get("sensitivity", "internal")),
            quality=int(data.get("quality", 3)),
            quality_reason=str(data.get("quality_reason", "")),
        )
    except Exception as e:
        print(f"  WARN classify failed: {e}", file=sys.stderr)
        return None


def detect_duplicates(docs: list[DocRow], threshold: float = 0.88) -> dict[str, str]:
    """Trả map ulid → canonical_ulid cho mọi doc là duplicate.

    Ngoài khoá canonical, toàn bộ docs cùng cụm dedup-link tới canonical.
    """
    # Dedup theo title similarity trong cùng dept (hoặc toàn bộ nếu chưa có dept)
    dup_map: dict[str, str] = {}
    groups: list[list[DocRow]] = []
    for d in docs:
        placed = False
        for g in groups:
            if title_similarity(d.title, g[0].title) >= threshold:
                g.append(d)
                placed = True
                break
        if not placed:
            groups.append([d])
    for g in groups:
        if len(g) < 2:
            continue
        # Chọn canonical: body dài nhất (thường chứa nhiều nội dung hơn)
        canonical = max(g, key=lambda x: len(x.body))
        for d in g:
            if d.id != canonical.id:
                dup_map[d.id] = canonical.rel_path
    return dup_map


def render_md(doc: DocRow, cls: Classification | None, deprecate_note: str | None) -> str:
    """Render lại markdown file với FM mới + body cũ (+ deprecate note nếu có)."""
    import yaml as _yaml

    status = doc.status
    body = doc.body.rstrip() + "\n"
    if deprecate_note:
        status = "deprecated"
        body += "\n" + deprecate_note + "\n"

    if cls:
        title = cls.title or doc.title
        tags = sorted({*cls.tags, *doc.tags})
        audience = cls.audience
        sensitivity = cls.sensitivity
    else:
        title = doc.title
        tags = doc.tags
        audience = doc.audience
        sensitivity = doc.sensitivity

    fm = {
        "id": doc.id,
        "title": title,
        "owner": doc.owner,
        "audience": audience,
        "sensitivity": sensitivity,
        "tags": tags,
        "source": doc.source,
        "last_reviewed": doc.last_reviewed or time.strftime("%Y-%m-%d"),
        "reviewer": doc.reviewer or doc.owner,
        "status": status,
        "related": [],
    }
    yaml_str = _yaml.safe_dump(fm, sort_keys=False, allow_unicode=True).strip()
    return f"---\n{yaml_str}\n---\n\n{body}"


def build_plans(
    docs: list[DocRow], dup_map: dict[str, str], skip_classify: bool, client, model: str
) -> list[Plan]:
    """Classify MỌI doc (cả duplicate) để đưa vào đúng folder.

    Duplicates vẫn được classify → move tới folder đúng + status=deprecated.
    """
    plans: list[Plan] = []
    for i, d in enumerate(docs, 1):
        cls = None
        if not skip_classify:
            print(f"[{i:3d}/{len(docs)}] classify: {d.title[:60]}")
            cls = classify_via_gemini(d, client, model)
            time.sleep(0.3)

        new_rel = d.rel_path
        if cls:
            sub = cls.subfolder or ""
            sub_seg = f"/{sub}" if sub else ""
            slug = slugify(cls.title)
            new_rel = f"{cls.zone}/{cls.dept}{sub_seg}/{slug}.md"
            if new_rel != d.rel_path and (KB_DIR / new_rel).exists():
                new_rel = f"{cls.zone}/{cls.dept}{sub_seg}/{slug}-{d.id[-6:].lower()}.md"

        is_dup = d.id in dup_map
        if is_dup:
            action = "deprecate-duplicate"
        elif cls and new_rel != d.rel_path:
            action = "move"
        elif cls and cls.title != d.title:
            action = "enrich"
        else:
            action = "keep"

        plans.append(
            Plan(
                doc=d,
                cls=cls,
                new_rel_path=new_rel if new_rel != d.rel_path else None,
                duplicate_of=dup_map.get(d.id),
                action=action,
            )
        )
    return plans


def print_report(plans: list[Plan]) -> None:
    by_action: dict[str, int] = {}
    for p in plans:
        by_action[p.action] = by_action.get(p.action, 0) + 1
    print("\n=== Re-organize plan ===")
    for a, c in sorted(by_action.items(), key=lambda x: -x[1]):
        print(f"  {a:25s}: {c}")
    print()
    # Preview
    moves = [p for p in plans if p.action == "move"]
    print(f"=== {len(moves)} moves (first 25) ===")
    for p in moves[:25]:
        q = f"q={p.cls.quality}" if p.cls else ""
        print(f"  {p.doc.rel_path[:55]:55s} → {p.new_rel_path}  {q}")
    dups = [p for p in plans if p.action == "deprecate-duplicate"]
    if dups:
        print(f"\n=== {len(dups)} duplicates to deprecate ===")
        for p in dups[:15]:
            print(f"  {p.doc.rel_path[:55]:55s}  (→ canonical: {p.duplicate_of})")


def apply_plans(plans: list[Plan]) -> dict[str, int]:
    counts = {"moved": 0, "enriched": 0, "deprecated_dup": 0, "kept": 0}
    for p in plans:
        if p.action == "deprecate-duplicate":
            note = (
                f"> **Deprecated** — {time.strftime('%Y-%m-%d')}: "
                f"Trùng với `{p.duplicate_of}`. Giữ lại để trace lineage, "
                "ẩn khỏi retrieval."
            )
            new_md = render_md(p.doc, cls=p.cls, deprecate_note=note)
            target_path = (
                KB_DIR / p.new_rel_path if p.new_rel_path else p.doc.path
            )
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_text(new_md, encoding="utf-8")
            if p.new_rel_path and p.doc.path.resolve() != target_path.resolve():
                p.doc.path.unlink()
            counts["deprecated_dup"] += 1
        elif p.action == "move":
            new_md = render_md(p.doc, cls=p.cls, deprecate_note=None)
            target = KB_DIR / p.new_rel_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(new_md, encoding="utf-8")
            if p.doc.path.resolve() != target.resolve():
                p.doc.path.unlink()
            counts["moved"] += 1
        elif p.action == "enrich":
            new_md = render_md(p.doc, cls=p.cls, deprecate_note=None)
            p.doc.path.write_text(new_md, encoding="utf-8")
            counts["enriched"] += 1
        else:
            counts["kept"] += 1
    KB_DIR.touch()
    return counts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--only", default=None, help="prefix rel_path để filter")
    parser.add_argument("--skip-classify", action="store_true", help="bỏ qua Gemini, chỉ dedup")
    parser.add_argument("--dup-threshold", type=float, default=0.88)
    args = parser.parse_args()

    if not KB_DIR.exists():
        print(f"ERROR: {KB_DIR} not found", file=sys.stderr)
        return 1

    docs = load_all_docs(only=args.only)
    print(f"Loaded {len(docs)} docs from {KB_DIR}" + (f" (only={args.only})" if args.only else ""))

    # Đừng đụng seed: nếu file ở folder dept chuẩn với ULID kiểu 01HM9A → skip classify
    for d in docs:
        if d.id.startswith("01HM9A"):
            d.body = d.body  # marker: seed, vẫn load để dedup xuất hiện nhưng ko reclassify

    # Dedup trên toàn bộ
    dup_map = detect_duplicates(docs, threshold=args.dup_threshold)
    print(f"Detected {len(dup_map)} duplicates")

    client = None
    model = os.environ.get("GEMINI_MODEL_CHAT", "gemini-2.5-flash")
    if not args.skip_classify:
        api_key = os.environ.get("GEMINI_API_KEY") or _read_env_key()
        if not api_key:
            print("WARN: GEMINI_API_KEY missing, fallback to --skip-classify", file=sys.stderr)
            args.skip_classify = True
        else:
            from google import genai

            client = genai.Client(api_key=api_key)

    # Skip seed docs in classify (giữ structure cũ)
    eligible = [d for d in docs if not d.id.startswith("01HM9A")]
    print(f"Eligible for reclassify: {len(eligible)} (non-seed)")

    plans = build_plans(eligible, dup_map, args.skip_classify, client, model)
    print_report(plans)

    if not args.apply:
        print("\n(dry-run; thêm --apply để thực thi)")
        return 0

    print("\nApplying plan…")
    counts = apply_plans(plans)
    print(f"Done. {counts}")
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
