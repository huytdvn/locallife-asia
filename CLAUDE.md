# CLAUDE.md

Hướng dẫn cho Claude (và bất kỳ AI coding agent nào) khi làm việc trên
repo này. Đọc kỹ trước khi sửa code.

## Repo này là gì

Local Life Asia — OTA du lịch trải nghiệm địa phương, trụ sở Đà Nẵng,
sáng lập Trần Đăng Huy. Repo chứa:

1. `index.html` — landing page công khai (vanilla HTML/CSS/JS, v1.0 launch
   05/04/2026). **Không đụng** trừ khi user yêu cầu rõ.
2. `apps/web/` — Next.js 15 App Router, chat AI nội bộ + admin console.
3. `apps/ingest/` — Python FastAPI, pipeline raw → markdown + front-matter.
4. `knowledge/` — source of truth nội dung nghiệp vụ (markdown + YAML FM).
5. `infra/`, `packages/` — shared tooling và dev services.

## Triết lý hệ thống (đừng vi phạm)

1. **Markdown là contract**. Mọi nội dung nghiệp vụ ở `knowledge/*.md`. DB
   chỉ là cache/index. Khi có xung đột: markdown thắng.
2. **3-way replication cho text, 2-way cho raw** (xem [`docs/storage.md`](docs/storage.md)):
   - **Text/markdown/hợp đồng working-copy/partner docs**: Git + Local
     server công ty + Cloudflare R2 (object-locked, versioned).
   - **Raw file** (PDF/ảnh/DOCX): Local server công ty + Google Drive.
   - Chatbot đọc từ **Local server** (mount `KNOWLEDGE_DIR`), không đọc
     trực tiếp từ git hay R2 trong runtime.
3. **Một đường đi dữ liệu duy nhất**: `raw → parse → normalize → markdown
   → commit(git) → sync(local+R2) → index → retrieve → answer`. Đừng
   thêm shortcut.
4. **Citation-or-reject**. AI chỉ trả lời những gì có trong knowledge base,
   luôn kèm citation `file#heading`. Không có → nói "chưa có tài liệu".
5. **RBAC ở tầng tool, không ở prompt**. `canRead()` trong
   `apps/web/lib/rbac.ts` chạy trước khi doc vào context — dù prompt có
   hỏi gì cũng không bypass được.
6. **Human-in-the-loop cho thay đổi**: AI soạn PR → người duyệt. Chỉ admin
   được `commit_update` trực tiếp, và luôn để lại audit.
7. **Không over-engineer**: Phase 0 là skeleton. Đừng thêm abstraction "cho
   sau". 3 dòng lặp lại tốt hơn 1 abstraction non.

## Kế hoạch (xem `/root/.claude/plans/hello-b-t-u-t-greedy-pudding.md` nếu còn)

Lộ trình 8 tuần, 5 phase:
- **Phase 0** (tuần 1): Foundation — scaffolding, taxonomy, 10 seed docs. ✅
- **Phase 1** (tuần 2-3): Chat MVP — streaming, auth, retrieval thật.
- **Phase 2** (tuần 3-5): Ingestion — PDF/Drive/OCR → markdown.
- **Phase 3** (tuần 5-6): Governance — RBAC đầy đủ, audit, write tools.
- **Phase 4** (tuần 6-8): Chất lượng — re-rank, analytics, review bot.

## Quy ước code

### TypeScript (`apps/web`)
- Strict mode. Không `any` — dùng `unknown` + narrow.
- Server actions và route handlers: validate input với Zod.
- Không tạo file index re-export trừ khi cần thiết.
- Import path: `@/...` trỏ tới `apps/web/`.

### Python (`apps/ingest`)
- Python 3.11+, typed (mypy strict).
- Pydantic cho mọi schema I/O.
- Mỗi parser trả dict chuẩn `{text, tables, metadata}` (xem `parsers/__init__.py`).
- Không blocking I/O trong request handler — queue thành job.

### Knowledge (`knowledge/*.md`)
- Mọi file phải có YAML front-matter đầy đủ (xem `knowledge/README.md`).
- Tiếng Việt có dấu; tên file slug tiếng Anh gạch nối.
- `id` là ULID, sinh 1 lần, không đổi (cross-ref dùng `id`, không dùng path).
- Review tối đa mỗi 90 ngày; bot nightly sẽ flag quá hạn.

## Branch & commit

- Feature branch: `claude/<scope>-<ticket>` (ví dụ `claude/ai-company-chat-system-Tz712`).
- Commit message tiếng Anh, dạng conventional: `feat(web): ...`, `chore(ingest): ...`.
- Mỗi commit nhỏ và có mục đích rõ; không bundle nhiều concern.

## Checklist trước khi báo "xong"

- [ ] `pnpm typecheck` pass (khi Phase 1 đã có deps install).
- [ ] `pnpm lint` pass.
- [ ] Nếu chạm knowledge base: front-matter đầy đủ, `last_reviewed` cập nhật.
- [ ] Nếu chạm RBAC: test cả 3 role (employee/lead/admin) + 3 sensitivity.
- [ ] Không có secret trong diff (dùng `.env.local`).
- [ ] Nếu thêm tool mới: định nghĩa rõ schema, có guard, có audit.

## Các file hay đụng

- `apps/web/lib/prompt.ts` — system prompt + prompt caching blocks
- `apps/web/lib/tools/index.ts` — tool use (search, read, draft, commit)
- `apps/web/lib/rbac.ts` — role + sensitivity guard
- `apps/web/lib/retrieval.ts` — hybrid search
- `apps/ingest/app/pipeline/frontmatter.py` — FM schema (single source of truth)
- `knowledge/README.md` — taxonomy + FM spec

## Đừng

- Đừng đoán nội dung knowledge base — luôn đọc file thật.
- Đừng thêm dependency mới mà không nêu lý do trong commit.
- Đừng viết doc mới vào `knowledge/` qua Claude trực tiếp nếu không được
  yêu cầu — cần PR + duyệt.
- Đừng commit vào `knowledge/` tự động từ code — đi qua pipeline ingestion.
- Đừng xoá/đổi `id` trong front-matter. Đổi path OK, đổi id thì break.
