import type Anthropic from "@anthropic-ai/sdk";
import type { Role } from "@/lib/rbac";
import { loadKnowledge } from "@/lib/knowledge-loader";

type SystemBlock = Anthropic.Messages.TextBlockParam;

/**
 * System prompt chia làm 3 block:
 *  1. Persona + rules (tĩnh, ít đổi) → cache_control "ephemeral".
 *  2. Catalog tài liệu (đổi khi knowledge/ thay đổi) → cache_control
 *     "ephemeral"; invalidate qua mtime của KNOWLEDGE_DIR (`loadKnowledge`
 *     tự trả cache theo mtime → cùng version tài liệu thì prompt giống y
 *     → hit cache).
 *  3. Bối cảnh phiên (role, ngày) → không cache (per-request).
 */
export function buildSystemPrompt(args: {
  role: Role;
  audience: string[];
}): SystemBlock[] {
  return [
    {
      type: "text",
      text: STATIC_SYSTEM,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: buildCatalogBlock(args.audience as Role[]),
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `Bối cảnh phiên:\n- Vai trò người dùng: ${args.role}\n- Audience cho phép: ${args.audience.join(", ")}\n- Ngày: ${new Date().toISOString().slice(0, 10)}`,
    },
  ];
}

function buildCatalogBlock(audience: Role[]): string {
  try {
    const docs = loadKnowledge();
    const visible = docs.filter((d) =>
      d.meta.audience.some((a) => audience.includes(a))
    );
    const lines = visible
      .map((d) => {
        const tags = d.meta.tags.slice(0, 4).join(",");
        return `- ${d.meta.path} | id=${d.meta.id} | audience=[${d.meta.audience.join(",")}] | tags=[${tags}] | ${d.meta.title}`;
      })
      .sort();
    return [
      "DANH MỤC TÀI LIỆU (catalog — dùng để quyết định search/get nào):",
      `Tổng cộng ${visible.length} doc hiện đang approved, đã lọc theo audience của phiên.`,
      "Mỗi dòng: path | id | audience | tags | title",
      "",
      ...lines,
    ].join("\n");
  } catch (err) {
    return `DANH MỤC TÀI LIỆU: (không nạp được — ${err instanceof Error ? err.message : String(err)})`;
  }
}

const STATIC_SYSTEM = `Bạn là trợ lý AI nội bộ của Local Life Asia — công ty
OTA du lịch trải nghiệm địa phương tại Đà Nẵng. Người dùng là nhân viên
Local Life Asia.

QUY TẮC TUYỆT ĐỐI:
1. Chỉ trả lời dựa trên tài liệu trong knowledge base (markdown trong
   \`knowledge/\`). Không bịa nội dung, không dùng kiến thức bên ngoài về công ty.
2. Luôn dùng tool \`search_knowledge\` trước khi trả lời bất kỳ câu hỏi
   nghiệp vụ nào. Nếu không tìm thấy → nói "Tôi chưa có tài liệu về việc này"
   và gợi ý liên hệ owner phòng ban tương ứng.
3. Kèm citation: với mỗi thông tin, trích file + heading. Ví dụ:
   \`10-hr/policies/leave-policy.md#các-loại-nghỉ\`.
4. Tôn trọng quyền: nếu tool trả kết quả đã bị lọc, không đoán nội dung bị
   giấu. Gợi ý người dùng liên hệ cấp có quyền.
5. Tiếng Việt tự nhiên, súc tích. Ưu tiên bullet khi trả lời quy trình.
6. Khi người dùng muốn sửa/tạo tài liệu, gọi \`draft_update\` để tạo PR, trừ
   khi họ là admin và yêu cầu ghi trực tiếp (\`commit_update\`).

VĂN PHONG:
- Ấm, gần gũi, đúng chất Local Life Asia — không cứng nhắc kiểu doanh nghiệp.
- Ngắn gọn, trực tiếp; không lặp câu hỏi.
- Không dùng emoji trừ khi người dùng dùng trước.`;
