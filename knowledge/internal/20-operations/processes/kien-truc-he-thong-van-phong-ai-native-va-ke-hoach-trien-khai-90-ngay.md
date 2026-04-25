---
id: 01KPYX5RX3MH4KJAK4A2WM28DH
title: Kiến trúc hệ thống văn phòng AI-native và Kế hoạch triển khai 90 ngày
owner: ops@locallife.asia
audience:
- lead
- admin
sensitivity: restricted
tags:
- ai_native
- architecture
- implementation_plan
- office_system
- paperclip_ai
- reviewed-by-admin
source:
- type: manual
  path: raw-ulid/01KPYX5QP7GQ97AX05ARPDRQRY.md
  captured_at: '2026-04-24'
last_reviewed: '2026-04-24'
reviewer: admin-dev@locallife.asia
status: draft
related: []
---

# Kiến trúc hệ thống văn phòng **AI-native** cho **LLA** + **TravelBus**

> **Ghi chú**: Đây là file md đầu tiên của vault, cũng là **ADR** (Architecture Decision Record) số 0001. Mọi quyết định lớn sau này đều follow format này.
>
> **v2 (2026-04-19)**: tích hợp **Paperclip AI** như tầng async workflow agent, làm rõ ranh giới Bot ↔ Agent, scope **Paperclip** hẹp lại còn tác vụ nội bộ.

## Mục lục

1.  [Bối cảnh & triết lý](#1-bối-cảnh--triết-lý)
2.  [Tài sản hiện có](#2-tài-sản-hiện-có)
3.  [Kiến trúc 4 lớp](#3-kiến-trúc-4-lớp)
4.  [Bot vs Agent — ranh giới quan trọng nhất](#4-bot-vs-agent--ranh-giới-quan-trọng-nhất)
5.  [Vai trò của Cowork](#5-vai-trò-của-cowork)
6.  [Vai trò của Paperclip](#6-vai-trò-của-paperclip)
7.  [Kế hoạch triển khai 90 ngày](#7-kế-hoạch-triển-khai-90-ngày)
8.  [Chi phí & **ROI** dự kiến](#8-chi-phí--roi-dự-kiến)
9.  [Rủi ro & mitigation](#9-rủi-ro--mitigation)
10. [Next actions](#10-next-actions)

---

## 1. Bối cảnh & triết lý

### Vấn đề cần giải

*   Staff cần truy vấn nhanh dữ liệu **TB** + **LLA** để tư vấn khách.
*   Nhân sự mới cần onboard nhanh qua dữ liệu nội bộ đã số hóa.
*   Staff cần sử dụng tool quản lý nền tảng qua mạng nội bộ/remote.
*   Đối tác cần hiểu nhanh nền tảng qua dữ liệu chuẩn hóa.
*   **Các tác vụ nội bộ lặp lại** (báo cáo định kỳ, tổng hợp, dispatch, alert) cần chạy nền không cần người trigger.
*   Nguyên tắc: **AI** hỗ trợ toàn bộ tác vụ văn phòng.

### Triết lý kiến trúc

> Xây **AI-first office**, có con người ở các nút quyết định — không phải "văn phòng có **AI**".

*   Nguồn sự thật duy nhất = file `.md` trong Git vault (có **frontmatter** metadata).
*   Con người và **AI** cùng đọc chung một nơi.
*   Khi nhân viên nghỉ việc, tri thức không đi theo.
*   Định nghĩa rõ 3 vùng: **AI** chủ động, **AI** hỗ trợ, con người thuần.
*   **Tách biệt Bot** (đối thoại, người-bắt-đầu) khỏi **Agent** (workflow, sự-kiện-bắt-đầu) — cùng nguồn dữ liệu, cùng tầng quyền, khác model thực thi.

### Quyết định then chốt

| Quyết định                                           | Lý do                                                                |
| :--------------------------------------------------- | :------------------------------------------------------------------- |
| **Markdown vault** trong **Git** (**Gitea** self-host) | **Long-term asset**, không **lock-in**, **AI** đọc được trực tiếp       |
| **Tailscale** từ đầu, không chờ "online trong tương lai" | Ép tài liệu hóa, dễ scale, bảo mật tốt                                |
| 3 bot riêng biệt theo role (không 1 bot chung)       | Phân quyền sạch, **attack surface** nhỏ hơn                          |
| **Paperclip** = tầng **async agent**, scope hẹp về nội bộ | Tận dụng 11+ **workflow** đã có, không build lại; scope rõ tránh trùng với bot |
| **Cowork** làm **UI** cho **Staff Bot**              | Tiết kiệm 2 tuần build **UI**, **UX** tốt cho staff                   |
| **MCP Hub** enforce quyền ở tầng tool, không ở prompt | **Prompt injection** không **bypass** được                          |
| Bot và **Paperclip agent** cùng dùng **MCP Hub**     | Một nơi **audit**, một nơi **RBAC**, không có **shadow access path** |
| **Transactional data** (**Postgres**) tách khỏi **knowledge** (**vault md**) | Tránh bot nói nhảm do nhầm loại dữ liệu                              |

---

## 2. Tài sản hiện có

### Phần cứng

*   **Máy A** (64GB **RAM**) — Windows desktop, i5 Gen 13, **GTX 12GB VRAM** → Server trung tâm.
*   **Máy B** (16GB **RAM**) → Staging / backup node / **Paperclip runner**.
*   **Mac M5** cá nhân → terminal nhẹ, **Cowork client**.

### Phần mềm & hệ thống

*   **Postgres DB** cho **TB** + **LLA**.
*   Tool sửa vé nhanh (**TB**), tool quản lý **bigdata** (**LLA**).
*   **Paperclip AI** (11+ **agents**) — **self-host** trên **workflow framework** có sẵn (**n8n** / **Dify** / **Flowise** / **Langflow** — chốt cụ thể ở **ADR** 0002 Tuần 1). Hiện đang chạy mix customer/ops/content; **scope mới sẽ hẹp về tác vụ nội bộ**.
*   **Claude Code** remote **workflow** qua **Tailscale SSH** (đã setup).

### Con người

*   Huy (founder) + Thanh (co-founder, đầu tư).
*   Đội dev nhỏ.
*   Vài ops staff.
*   Chưa có **DevOps** chuyên trách.

---

## 3. Kiến trúc 4 lớp

```
┌─────────────────────────────────────────────────────────────────────┐
│  LỚP 4: QA & ĐO LƯỜNG                                                │
│  Audit log thống nhất (bot + agent) • Feedback 1-click • Red team   │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  LỚP 3: AI EXECUTION LAYER                                           │
│                                                                      │
│  ── BOTS (interactive, người-bắt-đầu) ──                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐            │
│  │ Staff Bot   │  │ Onboarding   │  │ Partner Bot     │            │
│  │ (Cowork)    │  │ Bot (UI web) │  │ (UI web public) │            │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘            │
│         │                │                    │                      │
│  ── AGENTS (async, sự-kiện/cron-bắt-đầu) ──                         │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ Paperclip workflows (internal ops only)                 │        │
│  │ - báo cáo định kỳ  - dispatch  - tổng hợp  - alert     │        │
│  └────────────────────────────┬────────────────────────────┘        │
│                               │                                      │
│         ┌─────────────────────┴────────────────────┐                │
│         │              MCP HUB                      │ ← Auth + RBAC │
│         │     (6-8 tools, single audit log)         │   + Audit     │
│         └────────────────────┬─────────────────────┘                │
└──────────────────────────────┼──────────────────────────────────────┘
┌──────────────────────────────┼──────────────────────────────────────┐
│  LỚP 2: DỮ LIỆU CÓ CẤU TRÚC                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐            │
│  │ Vault md    │  │ pgvector     │  │ Postgres mirror │            │
│  │ (Gitea)     │  │ (embeddings) │  │ TB + LLA RO     │            │
│  └─────────────┘  └──────────────┘  └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  LỚP 1: HẠ TẦNG                                                      │
│  Máy A 64GB (Proxmox) • Máy B 16GB (staging + Paperclip)            │
│  Tailscale • UPS • Backup B2/R2                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Lớp 1 — Hạ tầng phần cứng & mạng

**Máy A** (64GB) — Server trung tâm:

*   **OS**: **Proxmox VE** (**hypervisor**) hoặc **Ubuntu Server 24.04** thuần.
*   **VM-1**: **Ubuntu** (**Postgres mirror**, **Gitea**, **MCP Hub**) — 16GB **RAM**, 200GB **SSD**.
*   **VM-2**: **Ubuntu** (**Ollama** + **Gemma 4**, **pgvector**) — 24GB **RAM**, **GPU passthrough**.
*   **VM-3**: staging — 8GB **RAM**.
*   (**Paperclip** *không* chạy ở **Máy A** — đẩy sang **Máy B** để cô lập **failure domain**).

**Máy B** (16GB) — Staging + **Paperclip** + backup:

*   **VM-B1**: **Replica Postgres** thứ 2 — 4GB.
*   **VM-B2**: **Paperclip framework runtime** — 8GB (**workflow engine** + **worker pool**).
*   **VM-B3**: **Gitea runner**, **cron**, **webhook receiver** — 2GB.
*   **Backup node** phòng khi **Máy A** chết.

**Lý do tách Paperclip qua Máy B:**

*   **Paperclip workflow** đôi khi đốt **CPU**/**RAM** bất chợt (**long-running scrape**, **batch export**). Cô lập khỏi **VM Postgres** + **MCP Hub**.
*   Nếu **Paperclip framework upgrade** fail, **Máy A** vẫn chạy bình thường.

**Mạng:**

*   **Tailscale** từ ngày đầu, **ACL** phân **group**: `founders`, `dev`, `ops`, `partner`, `paperclip-runner`.
*   **Paperclip** có **ACL** riêng: chỉ **outbound** được tới **MCP Hub** (port 8080) và **Postgres replica** (5432 **RO**), không đi đâu khác trong **tailnet**.
*   **UPS** 1500VA + **shutdown** tự động.
*   Backup hàng đêm lên **Backblaze B2** (~$6/TB/tháng) — bao gồm cả **Paperclip workflow definitions** (**export JSON**/**YAML** hàng đêm vào Git).

### Lớp 2 — Dữ liệu có cấu trúc

**Cấu trúc vault:**

```
/vault (Git repo, Gitea self-host)
├── README.md                    ← quy tắc viết md, frontmatter schema
├── company/                     ← văn hóa, chính sách, tổ chức
├── products/
│   ├── travelbus/               ← schema, flows, SOP vé
│   └── locallife/               ← schema, host lifecycle, LOK
├── playbooks/                   ← SOP theo tác vụ
├── partners/                    ← mỗi partner 1 folder
├── knowledge/                   ← kiến thức du lịch VN
├── decisions/                   ← ADR + biên bản họp
├── infrastructure/              ← docs về chính hệ thống này
└── automation/                  ← Paperclip workflow specs + runbook
    ├── workflows/               ← README mỗi workflow (mục đích, owner, SLA)
    └── exports/                 ← snapshot JSON/YAML định kỳ (auto-commit)
```

**Frontmatter schema bắt buộc:**

```yaml
---
title: "Tên rõ ràng"
id: "playbook-ticket-edit-001"
owner: "ops-team"                # phải là người thật, không phải team chung chung
created: 2026-04-19
last_reviewed: 2026-04-19
review_cycle: 90d

type: playbook                   # playbook|knowledge|policy|sop|adr|partner|workflow
applies_to: [travelbus]          # [travelbus|locallife|both|internal]
tags: [ticket, refund, urgent]

access: [staff, founder]         # [public|staff|founder|partner-{id}|paperclip]
sensitivity: internal            # public|internal|confidential

related: []
deprecated: false
---
```

> `access: [paperclip]` cho phép **Paperclip workflow** đọc — nhưng vẫn phải đi qua **MCP Hub auth**.

**Nguyên tắc tách dữ liệu:**

*   **Transactional** (**Postgres TB** + **LLA**) → **query** qua **MCP tool** `pg_query_readonly`.
*   **Knowledge** (**vault md**) → **query** qua **MCP tool** `vault_search` (**semantic**) hoặc `vault_read` (by path).
*   **Workflow state** (**Paperclip in-flight runs**) → trong **Paperclip framework's own DB**, *không* đẩy vào vault hoặc **Postgres TB**. Chỉ **outcome** (báo cáo, file md sinh ra) mới về vault.

**KHÔNG** trộn ba loại này.

**pgvector setup**: không đổi so với **v1** (**BGE-M3**, **hnsw**, **gin index** trên **frontmatter**).

### Lớp 3 — **AI Execution Layer**

#### Bots (interactive)

| Bot                      | Đối tượng      | Quyền đọc                                            | **UI**                        |
| :----------------------- | :-------------- | :--------------------------------------------------- | :---------------------------- |
| **Staff Assistant**      | Staff nội bộ    | Toàn vault trừ nhạy cảm, **Postgres RO**             | **Cowork**                    |
| **Onboarding Buddy**     | Nhân sự mới     | `/company`, `/products` public, playbook cơ bản      | **Web UI** (**OpenWebUI**/**LibreChat**) |
| **Partner Portal**       | Đối tác         | `/products/*/public`, **namespace partner** riêng | **Web UI public** (**Tailscale Funnel**/**CF Tunnel**) |

#### Agents (async)

| Agent group                 | Trigger                           | Quyền                                                      | Chạy ở    |
| :-------------------------- | :-------------------------------- | :--------------------------------------------------------- | :-------- |
| **Paperclip** — internal ops | **Cron** / **webhook** / **Staff Bot trigger** | Đọc qua **MCP Hub** (`access: [paperclip]`), ghi qua `vault_write_proposal` (**PR review**) | **Máy B VM-B2** |

**Phạm vi Paperclip agent (chốt scope nội bộ):**

*   ✅ Báo cáo định kỳ (**daily**/**weekly summary** từ **Postgres** + vault → md file).
*   ✅ **Dispatch** nội bộ (alert khi có **booking** đặc biệt → Telegram founders).
*   ✅ Tổng hợp đa nguồn (gom log → **executive digest**).
*   ✅ Nội dung nội bộ (sinh draft báo cáo, draft **SOP** — *luôn* qua **review** trước khi **merge**).
*   ❌ **Customer-facing chat** (chuyển qua **Staff Bot** hoặc **Partner Bot**).
*   ❌ Marketing/social tự post (**deprecate** hoặc **move** ra hệ thống khác — quyết ở Tuần 8).

#### **MCP Hub** — xương sống cho cả Bot + Agent

```
mcp-hub/
├── server.py
├── auth/
│   ├── tailscale_identity.py    # đọc header Tailscale-User-Login
│   ├── service_token.py         # token cho Paperclip (không có user identity)
│   └── rbac.py                  # user/service → role → allowed tools
├── tools/
│   ├── vault_search.py          # semantic search với filter access
│   ├── vault_read.py            # read file md theo path
│   ├── vault_write_proposal.py  # ← MỚI: tạo PR vào Gitea, không merge thẳng
│   ├── pg_query_readonly.py     # chỉ SELECT, whitelist bảng
│   ├── ticket_lookup.py         # lookup booking/vé cụ thể
│   ├── paperclip_run.py         # ← MỚI: bot trigger workflow Paperclip
│   └── paperclip_status.py      # ← MỚI: check status workflow đang chạy
└── audit/
    └── logger.py                # log mọi call vào Postgres (bot + agent chung 1 bảng)
```

**RBAC core (cập nhật):**

```python
ROLES = {
    "founder":          ["*"],
    "staff":            ["vault_search", "vault_read", "pg_query_readonly",
                         "ticket_lookup", "paperclip_run", "paperclip_status"],
    "onboarding":       ["vault_search", "vault_read"],
    "partner":          ["vault_search_public", "vault_read_public"],
    "paperclip-agent":  ["vault_search", "vault_read", "pg_query_readonly",
                         "vault_write_proposal"],   # KHÔNG có paperclip_run (tránh loop)
}
```

> **Quy tắc chống loop**: **Paperclip agent** không có quyền gọi `paperclip_run`. Chỉ Bot (qua user) hoặc **cron** mới trigger **workflow** được. Tránh agent tự gọi nhau vô hạn.

**Routing model (đơn giản hóa so với v1):**

```
Default: bắt đầu với Claude Haiku 4.5
  → Haiku tự đánh dấu confidence < threshold → escalate Sonnet
  → Lookup có pattern cứng (booking ID regex match) → Gemma 4 local
  → Paperclip agent: chọn model riêng theo workflow (cấu hình ở Paperclip)

Bỏ "intent classifier" tầng đầu — quá phức tạp + thêm 1 failure mode.
```

### Lớp 4 — **QA** & đo lường

*   **Audit log** thống nhất mọi câu trả lời (bot) + mọi tool call (agent) kèm nguồn → **review** hàng tuần. Một bảng `mcp_audit_log`, cột `actor_type` phân biệt `user|paperclip-agent|cron`.
*   **Feedback 1-click** (👍/👎) cho Bot — link `https://fb.tailnet.ts.net/r/<response_id>` mở form 3-giây. 👎 tạo **issue Gitea**, **assign owner**.
*   Cho **Paperclip**: mỗi **workflow** có **SLA** + **success criteria** trong `/automation/workflows/{id}.md`. Chạy fail / quá **SLA** → alert Telegram founders.
*   **Red team** định kỳ (hàng tháng): vượt quyền, **prompt injection**, rò rỉ đối tác, **Paperclip workflow** bị **inject input độc** (vì agent tự đọc data → có thể bị **prompt injection** qua file md).
*   **Alert** tự động: chi phí **API**, **latency**, tỷ lệ từ chối, **số workflow Paperclip fail/24h**.

---

## 4. Bot vs Agent — ranh giới quan trọng nhất

Đây là cái dễ nhầm nhất khi cả Bot và **Paperclip** cùng dùng **MCP Hub**. Quy tắc cứng:

| Thuộc tính           | Bot                            | Agent (**Paperclip**)                                     |
| :------------------- | :----------------------------- | :-------------------------------------------------------- |
| Ai bắt đầu           | Người dùng (gõ câu hỏi)         | **Cron**, **webhook**, hoặc Bot **trigger**               |
| Tương tác            | Đối thoại, có **turn**         | **One-shot** hoặc **DAG**, không **turn**                 |
| **Latency** mong đợi | Giây                           | Phút đến giờ                                              |
| **Identity** khi gọi **MCP** | **Tailscale user identity**    | **Service token** + **role** `paperclip-agent`            |
| Được phép ghi vault không? | Không (chỉ đề xuất qua chat) | Có, nhưng chỉ qua `vault_write_proposal` (tạo **PR**) |
| Được phép gọi nhau không? | Không                          | **Không** (chống loop)                                    |
| **Audit**            | `actor_type=user`              | `actor_type=paperclip-agent`                              |

### Khi nào tạo Bot, khi nào tạo Agent?

*   Cần người ra quyết định ở giữa **flow** → **Bot**.
*   Lặp lại theo lịch hoặc **trigger event** → **Agent**.
*   Có cả hai → **Bot trigger Agent** (ví dụ: staff hỏi "tạo báo cáo tuần cho host X" → **Staff Bot** gọi `paperclip_run("weekly_host_report", {host_id: X})`).

Quy tắc này sẽ được **formalize** ở **ADR** 0003 trong Tuần 5.

---

## 5. Vai trò của **Cowork**
