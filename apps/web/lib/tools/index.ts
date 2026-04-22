import { Type, type FunctionDeclaration } from "@google/genai";
import type { Session } from "@/lib/rbac";
import { searchKnowledge, getDocument } from "@/lib/retrieval";
import { canWriteDirect } from "@/lib/rbac";

export const toolDefinitions: FunctionDeclaration[] = [
  {
    name: "search_knowledge",
    description:
      "Tìm tài liệu nội bộ (markdown) phù hợp với câu hỏi. Luôn gọi tool này trước khi trả lời câu hỏi nghiệp vụ. Kết quả đã được filter theo quyền người dùng.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Câu truy vấn, tiếng Việt, càng cụ thể càng tốt",
        },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Filter theo tags (tuỳ chọn)",
        },
        top_k: { type: Type.INTEGER, description: "Số kết quả (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_document",
    description:
      "Đọc full markdown của 1 tài liệu theo id. Dùng sau khi search_knowledge cho ra kết quả hứa hẹn và cần xem chi tiết.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, description: "ULID doc" },
      },
      required: ["id"],
    },
  },
  {
    name: "draft_update",
    description:
      "Tạo PR draft đề xuất thay đổi 1 tài liệu. Mọi role đều gọi được; cần duyệt bởi owner.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        rationale: { type: Type.STRING },
        new_content: { type: Type.STRING },
      },
      required: ["id", "rationale", "new_content"],
    },
  },
  {
    name: "commit_update",
    description:
      "Ghi thẳng vào knowledge base. CHỈ admin dùng. Bắt buộc để lại audit log.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        rationale: { type: Type.STRING },
        new_content: { type: Type.STRING },
      },
      required: ["id", "rationale", "new_content"],
    },
  },
];

export type ToolResult = { content: string; citations?: string[] };

export async function runTool(
  name: string,
  input: unknown,
  session: Session
): Promise<ToolResult> {
  switch (name) {
    case "search_knowledge": {
      const { query, tags, top_k } = input as {
        query: string;
        tags?: string[];
        top_k?: number;
      };
      const hits = await searchKnowledge(session, {
        query,
        tags,
        topK: top_k ?? 5,
      });
      return {
        content: JSON.stringify(
          hits.map((h) => ({
            id: h.doc.id,
            title: h.doc.title,
            path: h.doc.path,
            heading: h.heading,
            excerpt: h.excerpt,
          }))
        ),
        citations: hits.map((h) => `${h.doc.path}#${slug(h.heading)}`),
      };
    }

    case "get_document": {
      const { id } = input as { id: string };
      const doc = await getDocument(session, id);
      if (!doc) {
        return {
          content: "Không tìm thấy hoặc không có quyền đọc tài liệu này.",
        };
      }
      return {
        content: doc.content,
        citations: [doc.doc.path],
      };
    }

    case "draft_update": {
      // TODO(phase-3): tạo PR qua GitHub API tới knowledge repo
      return {
        content: "Đã ghi nhận đề xuất. Phase 3 sẽ tạo PR thật.",
      };
    }

    case "commit_update": {
      if (!canWriteDirect(session.role)) {
        return {
          content:
            "Chỉ admin được ghi trực tiếp. Chuyển sang draft_update để tạo PR.",
        };
      }
      // TODO(phase-3): commit + audit log
      return { content: "Đã ghi (phase 3 sẽ thực hiện thật)." };
    }

    default:
      return { content: `Tool không hỗ trợ: ${name}` };
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
