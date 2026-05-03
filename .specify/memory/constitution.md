<!--
SYNC IMPACT REPORT
==================
Version: (template) → 1.0.0  (MAJOR — initial ratification)
Source: derived from CLAUDE.md "Triết lý hệ thống" (7 principles)
        + HANDOFF.md (locked decisions table)
        + package.json (tech stack)

Modified principles: N/A (first version)
Added sections:
  - Core Principles (I–VII)
  - Tech & Compliance Standards
  - Development Workflow & Quality Gates
  - Governance

Removed sections: none

Templates requiring updates:
  ✅ .specify/memory/constitution.md            (this file)
  ⚠ .specify/templates/plan-template.md         (Constitution Check section — see TODO below)
  ✅ .specify/templates/spec-template.md        (no constitution-bound rules; no change needed)
  ✅ .specify/templates/tasks-template.md       (no constitution-bound rules; no change needed)

Follow-up TODOs:
  - Update plan-template.md → "Constitution Check" to enumerate gates I–VII
    (handled in same change set as this constitution v1.0.0)
  - Re-confirm RATIFICATION_DATE with founder if a different date is preferred
-->

# Local Life Asia Platform Constitution

## Core Principles

### I. Markdown Là Contract (NON-NEGOTIABLE)

Mọi nội dung nghiệp vụ MUST sống ở `knowledge/*.md` với YAML front-matter
đầy đủ. Database, vector store, và bất kỳ index nào khác chỉ là **cache /
projection** của markdown. Khi có xung đột giữa DB và markdown: **markdown
thắng** — DB phải re-sync, không được "patch ngược" markdown từ DB.

**Rationale**: Một source of truth duy nhất. Audit, rollback, code review,
và human-in-the-loop chỉ khả thi khi nội dung là plain-text trong git.

### II. Replication 3-Way Text / 2-Way Raw (NON-NEGOTIABLE)

- **Text** (markdown, hợp đồng working-copy, partner docs): Git +
  Local server công ty + Cloudflare R2 (object-locked, versioned).
- **Raw** (PDF, ảnh, DOCX scan): Local server công ty + Google Drive.
- **Chatbot runtime đọc từ Local server** (`KNOWLEDGE_DIR` mount). MUST
  NOT đọc trực tiếp git working tree hay R2 trong runtime.

Spec đầy đủ: [`docs/storage.md`](../../docs/storage.md).

**Rationale**: Disaster recovery, immutability cho audit (R2 object lock),
và tách runtime path khỏi developer path.

### III. Một Đường Đi Dữ Liệu Duy Nhất (NON-NEGOTIABLE)

Pipeline cố định: `raw → parse → normalize → markdown → commit(git) →
sync(local + R2) → index → retrieve → answer`.

MUST NOT thêm shortcut, side-channel, hay "fast path" bỏ qua bất kỳ bước
nào — kể cả khi "chỉ cho dev". Nếu cần debug: thêm observability hook,
không tạo nhánh data flow song song.

**Rationale**: Mỗi shortcut là một drift surface giữa test/prod. Một
đường đi = một invariant để verify.

### IV. Citation-or-Reject (NON-NEGOTIABLE)

AI MUST chỉ trả lời từ nội dung có trong knowledge base, MUST kèm citation
dạng `file#heading`. Không tìm thấy → MUST trả "chưa có tài liệu" (hoặc
draft proposal qua tool `draft_update`). MUST NOT bịa, MUST NOT trả lời
"theo kinh nghiệm chung".

**Rationale**: Chatbot phục vụ nội bộ + đối tác (host/LOK) — câu trả lời
sai có hậu quả thật (tiền, uy tín, pháp lý). Citation là điều kiện cần
để người dùng verify và để audit.

### V. RBAC Ở Tầng Tool, Không Ở Prompt (NON-NEGOTIABLE)

`canRead()` trong [`apps/web/lib/rbac.ts`](../../apps/web/lib/rbac.ts) MUST
chạy **trước khi** doc vào context của LLM. Filter MUST diễn ra ở payload
filter của vector store + post-retrieval check, không phải ở system prompt.

MUST NOT dựa vào prompt instruction ("đừng trả lời restricted") để gate
thông tin nhạy cảm — prompt có thể bị override; tool layer thì không.

**Rationale**: Prompt-level guard là defense-in-depth tốt nhưng không đủ.
LLM jailbreak / prompt injection bypass được prompt rule; bypass được
filter ở tool layer thì cần exploit code thật.

### VI. Human-in-the-Loop Cho Mọi Thay Đổi Knowledge

AI MUST soạn PR (tool `draft_update`) cho người duyệt. Chỉ role `admin`
được phép `commit_update` trực tiếp, và mọi commit MUST để lại audit log
qua [`apps/web/lib/audit.ts`](../../apps/web/lib/audit.ts).

MUST NOT có code path nào cho phép AI auto-merge vào `knowledge/` không
qua review — kể cả "trivial fix typo".

**Rationale**: Knowledge sai = câu trả lời sai cho hàng nghìn truy vấn
sau đó. Cost của 1 PR review << cost của 1 doc nhiễm sai.

### VII. Không Over-Engineer (YAGNI)

3 dòng lặp lại > 1 abstraction non. MUST NOT thêm dependency, abstraction
layer, hay config knob "cho sau" mà không có use case ngay. Phase hiện
tại = scope hiện tại.

**Rationale**: Repo còn nhỏ, team sẽ scale dần. Mỗi abstraction sớm là
một quyết định kiến trúc chưa có data để inform — gần như chắc chắn sai.

## Tech & Compliance Standards

**Stack chốt** (không đổi không qua amendment):

| Layer            | Choice                                                  |
|------------------|---------------------------------------------------------|
| Web app          | Next.js 15 App Router, TypeScript strict, no `any`      |
| Ingestion        | Python 3.11+, FastAPI, mypy strict, Pydantic schemas    |
| AI provider      | Google Gemini 2.5 Flash (chat+tool) / Flash Lite (rerank) |
| Embedding        | Voyage-3 managed (fallback `bge-m3` self-host)          |
| Vector DB        | Qdrant Cloud (free tier MVP)                            |
| RDBMS            | Neon Postgres                                           |
| Object storage   | Cloudflare R2 (`locallife-raw` + `locallife-kb-archive`) |
| Queue            | Redis + RQ (dev) / Upstash (prod)                       |
| Auth             | NextAuth + Google Workspace SSO (`@locallife.asia`)     |
| Package manager  | pnpm 10 workspace                                       |
| Node             | >= 22                                                   |

**Compliance**:

- Knowledge tiếng Việt MUST có dấu; slug filename tiếng Anh, gạch nối.
- Mọi `knowledge/*.md` MUST có front-matter: `id` (ULID, immutable),
  `title`, `owner`, `audience`, `sensitivity`, `last_reviewed`,
  `reviewer`, `status`, `tags`. Spec: [`knowledge/README.md`](../../knowledge/README.md).
- `id` MUST NOT thay đổi sau khi sinh. Đổi path OK; đổi `id` = break
  cross-ref.
- Review tối đa mỗi 90 ngày; bot nightly flag quá hạn.
- Object Lock retention theo sensitivity: `restricted` 10 năm,
  `internal` 3 năm, `public` 1 năm.

**Security**:

- Secrets chỉ trong `.env.local` (gitignored). MUST NOT commit secret
  trong diff — pre-commit + review gate.
- `.claude/` (project-level) MUST được gitignore phần chứa credentials
  của agent extension.

## Development Workflow & Quality Gates

**Spec-driven development (SDD) là default** cho mọi feature non-trivial:

1. `/speckit-constitution` (1 lần / project — file này)
2. `/speckit-specify` — WHAT/WHY (no tech)
3. `/speckit-clarify` — gỡ ambiguity (recommended)
4. `/speckit-plan` — stack, contracts, kiến trúc
5. `/speckit-tasks` — chia task
6. `/speckit-analyze` — cross-check (optional)
7. `/speckit-implement` — thực thi

Trivial fix (typo, 1-line bug, dep bump) MAY skip SDD.

**Branch & commit**:

- Feature branch: `claude/<scope>-<ticket>` (ví dụ
  `claude/ai-company-chat-system-Tz712`).
- Commit message tiếng Anh, conventional commits (`feat(web): ...`,
  `fix(ingest): ...`, `docs(knowledge): ...`). Một commit = một concern.
- MUST NOT bypass hooks (`--no-verify`, `--no-gpg-sign`) trừ khi user
  yêu cầu rõ.

**Pre-merge checklist** (MUST pass):

- [ ] `pnpm typecheck` pass
- [ ] `pnpm lint` pass
- [ ] `pnpm --filter web test` pass (khi đã có test cho code chạm)
- [ ] Nếu chạm `knowledge/`: front-matter đầy đủ, `last_reviewed` cập nhật
- [ ] Nếu chạm RBAC: test cả 3 role × 3 sensitivity
- [ ] Không có secret trong diff
- [ ] Nếu thêm tool mới: schema + guard + audit có sẵn

**Eval gates** (per phase, từ HANDOFF.md):

- Retrieval recall@5 ≥ 95%, precision@1 ≥ 90% (gold set ở `evals/gold.json`).
- Latency P50 < 1.5s end-to-end (retrieval).
- RBAC negative cases: 100% pass.

## Governance

**Authority**: Constitution này supersede mọi best-practice / convention
khác trong repo (bao gồm `CLAUDE.md` nếu xung đột). Khi `CLAUDE.md` và
constitution xung đột → constitution thắng; cập nhật `CLAUDE.md` cùng
PR amendment.

**Amendment procedure**:

1. PR sửa `.specify/memory/constitution.md` + lý do trong PR description.
2. Sync impact report (HTML comment đầu file) MUST cập nhật.
3. Bump version theo semver:
   - **MAJOR**: principle bị xoá / redefine không tương thích.
   - **MINOR**: thêm principle / section mới hoặc mở rộng đáng kể.
   - **PATCH**: clarification, sửa typo, không đổi nghĩa.
4. Templates phụ thuộc (`.specify/templates/*.md`) MUST sync trong cùng PR.
5. Founder (huy@locallife.asia) approve.

**Compliance review**: Mỗi PR review MUST verify không vi phạm principle
I–VII. Vi phạm cố ý phải ghi vào "Complexity Tracking" của plan với lý do
+ alternative đã xét.

**Versioning policy**: Constitution version độc lập với app version.
Constitution v1.x.y không ràng buộc app v1.x.y.

**Runtime guidance**: [`CLAUDE.md`](../../CLAUDE.md) là day-to-day
operational guide; constitution là rule book. Đọc constitution khi có
nghi ngờ về principle; đọc CLAUDE.md khi tìm "làm sao để X".

**Version**: 1.0.0 | **Ratified**: 2026-05-02 | **Last Amended**: 2026-05-02
