import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getById, setStatus } from "@/lib/onboarding/knowledge-task";
import { genai, FAST_MODEL } from "@/lib/llm";

export const runtime = "nodejs";

/**
 * AI draft endpoint — gen markdown body cho 1 knowledge_task. Trả nháp
 * (markdown text + suggested front-matter); admin sẽ review + commit qua
 * existing draft_update / commit_update flow đã có.
 *
 * v1: KHÔNG auto-commit, KHÔNG mở PR. Admin copy-paste hoặc dùng nút
 * "save as draft" trong admin docs UI sau khi review.
 */

const PROMPT_TEMPLATE = `Bạn là biên tập viên tài liệu nội bộ Local Life Asia.
Soạn 1 tài liệu markdown ngắn gọn về chủ đề sau, tone thân tình tiếng Việt
có dấu, headings rõ ràng, dùng ví dụ cụ thể từ ngữ cảnh OTA du lịch trải
nghiệm địa phương Đà Nẵng.

QUY TẮC:
- Độ dài ≤ 800 từ. Bullet/table tốt hơn đoạn dài.
- KHÔNG bịa số liệu / tên người / quy trình mà không có cơ sở; nếu cần
  đặt placeholder dạng "[cần bổ sung: <mô tả>]".
- Không xưng "tôi"; nói chung "chúng ta" / "công ty".
- Mỗi heading rõ mục đích (vd: "## 1. Khi nào áp dụng?").
- Kết với 1 section "## Liên hệ thắc mắc" placeholder.

Trả markdown thô (không kèm giải thích / không wrap trong \`\`\`).`;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden" } },
      { status: 403 }
    );
  }

  const { id } = await params;
  const taskId = Number(id);
  const task = await getById(taskId);
  if (!task) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found" } },
      { status: 404 }
    );
  }

  await setStatus(taskId, "drafting");

  const prompt = `${PROMPT_TEMPLATE}\n\nChủ đề: ${task.topic}\n` +
    `Đối tượng đọc: ${task.audience.join(", ")}\n` +
    `Cấp độ: ${task.level ?? "(không phân cấp)"}\n` +
    (task.notes ? `Ghi chú thêm từ admin: ${task.notes}\n` : "");

  try {
    const resp = await genai.models.generateContent({
      model: FAST_MODEL,
      contents: [prompt],
    });
    const markdown = (resp.text ?? "").trim();
    if (!markdown) throw new Error("AI không sinh được nội dung");

    const suggestedTitle = task.topic;
    const slug = task.topic
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);

    const frontMatter = {
      title: suggestedTitle,
      audience: task.audience,
      sensitivity: task.audience.includes("host") ? "public" : "internal",
      tags: ["onboarding", "ai-drafted"],
      status: "draft",
      owner: task.createdByEmail,
    };

    return NextResponse.json({
      ok: true,
      data: {
        taskId,
        suggestedSlug: slug,
        suggestedFrontMatter: frontMatter,
        markdown,
        instruction:
          "Review nháp; copy hoặc dùng admin docs UI để lưu vào knowledge/. " +
          "Sau khi merge, gọi POST /api/onboarding/admin/knowledge-tasks/:id/mark-merged " +
          "để chuyển status.",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "draft_fail",
          message: e instanceof Error ? e.message : String(e),
        },
      },
      { status: 502 }
    );
  }
}
