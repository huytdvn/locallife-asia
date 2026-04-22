import { Type, type FunctionDeclaration } from "@google/genai";
import type { Session } from "@/lib/rbac";
import { searchKnowledge, getDocument } from "@/lib/retrieval";
import { canWriteDirect } from "@/lib/rbac";
import { draftUpdate, commitUpdateDirect, GithubError } from "@/lib/github";
import { writeAudit } from "@/lib/audit";

function repoPathFor(docPath: string): string {
  const subdir = process.env.KNOWLEDGE_REPO_SUBDIR ?? "knowledge";
  return subdir ? `${subdir}/${docPath}` : docPath;
}

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
      const { id, rationale, new_content } = input as {
        id: string;
        rationale: string;
        new_content: string;
      };
      const doc = await getDocument(session, id);
      if (!doc) {
        return { content: "Không tìm thấy doc (hoặc không có quyền đọc)." };
      }
      try {
        const pr = await draftUpdate({
          id,
          rationale,
          newContent: new_content,
          repoPath: repoPathFor(doc.doc.path),
          actorEmail: session.email,
        });
        await writeAudit({
          actorEmail: session.email,
          role: session.role,
          action: "draft_update",
          docId: id,
          answerExcerpt: rationale,
          metadata: { pr_url: pr.prUrl, branch: pr.branch },
        });
        return {
          content: `Đã tạo PR draft: ${pr.prUrl}. Owner sẽ review & merge.`,
          citations: [doc.doc.path],
        };
      } catch (err) {
        const msg =
          err instanceof GithubError ? err.message : "Lỗi tạo PR";
        return { content: `Không tạo được PR: ${msg}` };
      }
    }

    case "commit_update": {
      if (!canWriteDirect(session.role)) {
        return {
          content:
            "Chỉ admin được ghi trực tiếp. Chuyển sang draft_update để tạo PR.",
        };
      }
      const { id, rationale, new_content } = input as {
        id: string;
        rationale: string;
        new_content: string;
      };
      const doc = await getDocument(session, id);
      if (!doc) {
        return { content: "Không tìm thấy doc." };
      }
      try {
        const commit = await commitUpdateDirect({
          id,
          rationale,
          newContent: new_content,
          repoPath: repoPathFor(doc.doc.path),
          actorEmail: session.email,
        });
        await writeAudit({
          actorEmail: session.email,
          role: session.role,
          action: "commit_update",
          docId: id,
          answerExcerpt: rationale,
          metadata: { commit_sha: commit.commitSha, html_url: commit.htmlUrl },
        });
        return {
          content: `Đã commit thẳng: ${commit.htmlUrl}`,
          citations: [doc.doc.path],
        };
      } catch (err) {
        const msg = err instanceof GithubError ? err.message : "Lỗi commit";
        return { content: `Không commit được: ${msg}` };
      }
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
