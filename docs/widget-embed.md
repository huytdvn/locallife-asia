# Chat widget — embed trong dashboard back-office

Widget chat free-tier dành cho **host** và **LOK** (Local Opinions). Mục
đích: trợ lý onboarding + FAQ trực tiếp trong dashboard back-office, không
cần SSO @locallife.asia.

> Bảo mật: widget có quyền truy cập **chỉ** `host/*` và `public/*`
> (cho host) hoặc `lok/*` và `public/*` (cho LOK). RBAC đã ép cứng ở
> server — không có cách nào widget đọc internal/finance/HR docs.

## Kiến trúc

```
┌─────────────────────┐                                   ┌────────────────────────┐
│ host.locallife.asia │                                   │  chat.locallife.asia   │
│  (back-office FE)   │                                   │   (this repo)          │
│                     │                                   │                        │
│  <script widget.js  │ ──── 1. fetch(`<widget.js>`) ───→ │  /widget.js            │
│   data-token="…">   │                                   │                        │
│        │            │ ──── 2. POST /api/chat/widget ──→ │  /api/chat/widget      │
│        │            │      Bearer <HMAC-token>          │  • verify HMAC         │
│        │            │      Origin allowlist             │  • RBAC=host/lok       │
│        │            │ ←──── SSE stream ─────────────    │  • Gemini + tools      │
│        │            │                                   │                        │
│  back-office API    │ ──── 3. POST /api/widget/token ─→ │  /api/widget/token     │
│  (mints tokens)     │      Bearer <SHARED-SECRET>       │  • shared-secret check │
│                     │ ←──── { token, exp } ──────────   │  • HMAC-sign claims    │
└─────────────────────┘                                   └────────────────────────┘
```

3 thành phần auth:
- **`WIDGET_HMAC_SECRET`** — HMAC ký token. Chia sẻ giữa minter và verifier.
- **`BACKOFFICE_SHARED_SECRET`** — back-office gọi `/api/widget/token` server-side.
- **`WIDGET_ALLOWED_ORIGINS`** — CORS allowlist cho `/api/chat/widget`.

## Setup phía chat backend (repo này)

`.env.local`:
```env
WIDGET_HMAC_SECRET=<openssl rand -base64 48>
BACKOFFICE_SHARED_SECRET=<openssl rand -base64 48>
WIDGET_ALLOWED_ORIGINS=https://host.locallife.asia,https://lok.locallife.asia
```

(Trong dev: thêm `http://localhost:4003,http://localhost:5173` vào allowlist.)

## Setup phía back-office (repo khác)

### Bước 1 — Server-side: mint token cho dashboard session

Khi user vào host dashboard, back-office backend gọi chat backend để xin token, rồi inject vào trang.

**Node/Express ví dụ**:
```js
// back-office/server/widget-token.js
import fetch from 'node-fetch';

export async function mintWidgetToken({ tenantId, mode }) {
  const r = await fetch('https://chat.locallife.asia/api/widget/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.BACKOFFICE_SHARED_SECRET}`,
    },
    body: JSON.stringify({
      mode,                       // 'host' | 'lok'
      tenantId,                   // host_id hoặc lok_id từ DB của bạn
      ttlSeconds: 3600,           // 1h, optional
    }),
  });
  if (!r.ok) throw new Error(`token mint failed: ${r.status}`);
  return r.json();                // { token, exp }
}
```

### Bước 2 — Gắn vào dashboard HTML

```html
<!-- ssrender vào host dashboard layout -->
<script
  src="https://chat.locallife.asia/widget.js"
  data-mode="host"
  data-token="<%= widgetToken %>"
  async defer></script>
```

Hoặc React (lazy):
```jsx
import { useEffect } from 'react';

export function ChatWidget({ token, mode }) {
  useEffect(() => {
    if (!token) return;
    const s = document.createElement('script');
    s.src = 'https://chat.locallife.asia/widget.js';
    s.async = true; s.defer = true;
    s.dataset.mode = mode;
    s.dataset.token = token;
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, [token, mode]);
  return null;
}
```

## UX

- Bubble góc phải dưới (💬), click mở panel 360×520 px.
- Tin nhắn welcome khác cho host vs LOK.
- SSE streaming, hiện citations dưới mỗi câu trả lời.
- Rate limit: 30 turn / 10 phút / `tenantId` — nếu vượt, bot trả 429 + Retry-After.

## Test ở local (dev bypass)

```bash
# 1. Chạy chat backend
pnpm --filter web dev

# 2. Sinh token bằng tay (cần WIDGET_HMAC_SECRET set)
node -e "
const { signWidgetToken } = require('./apps/web/lib/widget-auth.ts');
console.log(signWidgetToken({ mode: 'host', tenantId: 'test-1' }));
"

# 3. curl widget endpoint với X-Widget-Dev bypass origin check
curl -N -X POST http://localhost:3000/api/chat/widget \
  -H "Content-Type: application/json" \
  -H "X-Widget-Dev: 1" \
  -H "Authorization: Bearer <token-từ-bước-2>" \
  -d '{"messages":[{"role":"user","content":"Làm sao đăng ký host?"}]}'
```

## Lưu ý vận hành

- **Chu kỳ rotate `WIDGET_HMAC_SECRET`**: 90 ngày khuyến nghị. Khi rotate, accept cả secret cũ + mới trong 24h grace (TODO: implement key list).
- **Rate limit per-tenant** lưu in-memory; horizontal scale → cần chuyển sang Redis.
- **Audit**: tất cả turn ghi vào `audit_log` với `actor_email = "widget:host:<tenantId>"`. Query analytics:
  ```sql
  SELECT actor_email, count(*), max(ts)
    FROM audit_log
   WHERE action='widget_chat' AND ts > now() - interval '7 days'
   GROUP BY actor_email ORDER BY 2 DESC;
  ```
- **Knowledge filtering**: chỉ doc audience có `host` hoặc `guest` (cho host mode), `lok` hoặc `guest` (cho LOK mode), và `status=approved`. Doc `draft`, `restricted`, hoặc audience-mismatch không xuất hiện trong catalog → AI không biết tới.
