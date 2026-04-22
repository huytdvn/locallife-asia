# `apps/web` — Next.js chat + admin

Giao diện chat nội bộ và admin console cho Local Life Asia.

## Phase 0 (hiện tại)

Skeleton Next.js 15 App Router + stub cho mọi layer chính. **Chưa chạy được**
— cần `pnpm install` + env + knowledge base trước.

Cấu trúc:

```
app/
  (chat)/page.tsx        # chat UI (streaming sẽ ở Phase 1)
  api/chat/route.ts      # endpoint, tool-use loop
  layout.tsx + globals.css  # theme Local Life Asia (xanh rêu, cam, Be Vietnam Pro)
lib/
  anthropic.ts           # Claude client, model routing
  prompt.ts              # system prompt + prompt caching blocks
  rbac.ts                # Role, Sensitivity, canRead — guard ở tầng tool
  retrieval.ts           # hybrid search stub
  tools/index.ts         # search_knowledge, get_document, draft/commit_update
  auth.ts                # requireSession, dev impersonation
components/
  chat.tsx               # UI chat client
```

## Chạy dev (khi Phase 1 sẵn sàng)

```bash
# từ root monorepo
pnpm install
cp ../../.env.example ../../.env.local  # điền ANTHROPIC_API_KEY, v.v.
pnpm dev
```

## Test phân quyền ở dev

Gửi request với header `X-Dev-Role: employee|lead|admin` để impersonate.
Giúp test RBAC nhanh mà không cần SSO.

## TODOs Phase 1+

- [ ] NextAuth Google Workspace SSO
- [ ] Streaming SSE cho `/api/chat`
- [ ] Hybrid retrieval thật (Qdrant + BM25)
- [ ] Citations panel tương tác (click → xem markdown gốc)
- [ ] Admin console: upload raw, review drafts
- [ ] Re-ranking với Haiku
- [ ] Prompt caching danh mục tài liệu (rebuild theo commit knowledge)
