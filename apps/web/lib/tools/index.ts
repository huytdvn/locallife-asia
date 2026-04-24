import { Type, type FunctionDeclaration } from "@google/genai";
import type { Session, Role, Sensitivity } from "@/lib/rbac";
import { searchKnowledge, getDocument } from "@/lib/retrieval";
import { canWriteDirect } from "@/lib/rbac";
import { draftUpdate, commitUpdateDirect, GithubError } from "@/lib/github";
import { writeAudit } from "@/lib/audit";
import {
  EditorError,
  createDoc,
  getFullDoc,
  hardDeleteDoc,
  writeDoc,
  type EditableFM,
} from "@/lib/knowledge-editor";
import { getPathsForRole, getPathBySlug } from "@/lib/training";
import matter from "gray-matter";

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
      "Ghi thẳng vào knowledge base (update doc đã tồn tại). CHỈ admin. Bắt buộc để lại audit log.",
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
    name: "create_document",
    description:
      "Tạo tài liệu MỚI trong KB (không cần id sẵn). CHỈ admin. Dùng khi user yêu cầu soạn quy trình/chính sách/biểu mẫu mới. Path phải bắt đầu bằng internal/ host/ lok/ public/ hoặc inbox/.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description:
            "Relative path .md trong knowledge/, vd: internal/10-hr/onboarding/onboarding-sales-week-1.md",
        },
        title: { type: Type.STRING },
        audience: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Role được đọc: employee|lead|admin|host|lok|guest",
        },
        sensitivity: {
          type: Type.STRING,
          description: "public | internal | restricted",
        },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        owner: { type: Type.STRING, description: "Email owner" },
        body: {
          type: Type.STRING,
          description: "Markdown body (KHÔNG kèm YAML FM)",
        },
        rationale: { type: Type.STRING, description: "Lý do tạo" },
      },
      required: ["path", "title", "audience", "body", "rationale"],
    },
  },
  {
    name: "suggest_training",
    description:
      "Trả lộ trình tự học phù hợp với role của người dùng. Dùng khi user yêu cầu training / onboarding / tự học (vd: 'cho mình link học onboarding', 'nhân viên mới cần học gì'). Tự động filter theo role session. Trả URL clickable dạng /training/<slug>.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        slug: {
          type: Type.STRING,
          description:
            "(Tuỳ chọn) slug cụ thể nếu user chỉ rõ. Bỏ trống = list tất cả path cho role hiện tại.",
        },
        topic: {
          type: Type.STRING,
          description:
            "(Tuỳ chọn) gợi ý bằng keyword nếu slug không biết, vd: 'sales', 'host', 'lok'",
        },
      },
      required: [],
    },
  },
  {
    name: "hard_delete_document",
    description:
      "XOÁ VĨNH VIỄN tài liệu khỏi filesystem. NGUY HIỂM — không khôi phục được. Bị chặn mặc định, cần password supervisor do sếp Huy cấp. Nếu user yêu cầu xoá: KHÔNG tự ý gọi, trước tiên nhắc user rằng soft-delete (deprecate) an toàn hơn và hỏi có chắc cần hard delete không; nếu có, xin password.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, description: "ULID tài liệu" },
        password: {
          type: Type.STRING,
          description: "Mật khẩu xác minh sếp Huy cấp",
        },
        reason: { type: Type.STRING, description: "Lý do bắt buộc" },
      },
      required: ["id", "password", "reason"],
    },
  },
];

export interface CitationRef {
  docId: string;
  path: string;
  heading: string;
  title: string;
}

export type ToolResult = {
  content: string;
  citations?: string[];
  citationRefs?: CitationRef[];
};

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
        citationRefs: hits.map((h) => ({
          docId: h.doc.id,
          path: h.doc.path,
          heading: h.heading,
          title: h.doc.title,
        })),
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
        citationRefs: [
          {
            docId: doc.doc.id,
            path: doc.doc.path,
            heading: "",
            title: doc.doc.title,
          },
        ],
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
      const current = getFullDoc(id);
      if (!current) {
        return { content: "Không tìm thấy tài liệu với id này." };
      }

      // Parse new_content: nếu có FM (---...---) thì extract, không thì treat as body
      const parsed = matter(new_content);
      const providedFm = parsed.data as Record<string, unknown>;
      const newBody = parsed.content || new_content;

      // Merge: giữ FM cũ, override bằng field AI gửi, luôn bump last_reviewed
      const today = new Date().toISOString().slice(0, 10);
      const fm: EditableFM = {
        title: (providedFm.title as string | undefined) ?? current.meta.title,
        owner: (providedFm.owner as string | undefined) ?? current.meta.owner,
        audience:
          (providedFm.audience as typeof current.meta.audience | undefined) ??
          current.meta.audience,
        sensitivity:
          (providedFm.sensitivity as typeof current.meta.sensitivity | undefined) ??
          current.meta.sensitivity,
        tags: (providedFm.tags as string[] | undefined) ?? current.meta.tags,
        last_reviewed: today,
        reviewer: session.email,
        status:
          (providedFm.status as typeof current.meta.status | undefined) ??
          current.meta.status,
      };

      // Thử local FS trước (luôn hoạt động trên dev)
      try {
        const meta = writeDoc(id, { fm, body: newBody });
        await writeAudit({
          actorEmail: session.email,
          role: session.role,
          action: "commit_update",
          docId: id,
          answerExcerpt: rationale,
          metadata: { path: meta.path, local_write: true },
        });

        // Optional: nếu có GITHUB_TOKEN, push lên git song song (best-effort)
        let prMsg = "";
        if (process.env.GITHUB_TOKEN) {
          try {
            const commit = await commitUpdateDirect({
              id,
              rationale,
              newContent: new_content,
              repoPath: repoPathFor(meta.path),
              actorEmail: session.email,
            });
            prMsg = ` · Đã sync GitHub: ${commit.htmlUrl}`;
          } catch (err) {
            if (!(err instanceof GithubError)) throw err;
            prMsg = " (GitHub sync skip — token/perm issue)";
          }
        }

        return {
          content: `Đã cập nhật "${meta.title}" thành công.${prMsg} Tài liệu sẵn sàng tra cứu ngay.`,
          citations: [meta.path],
          citationRefs: [
            {
              docId: meta.id,
              path: meta.path,
              heading: "",
              title: meta.title,
            },
          ],
        };
      } catch (err) {
        const msg =
          err instanceof EditorError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Lỗi ghi file";
        return { content: `Không update được: ${msg}` };
      }
    }

    case "create_document": {
      if (!canWriteDirect(session.role)) {
        return {
          content:
            "Tạo tài liệu mới chỉ dành cho admin. Bạn đang đăng nhập với role "
            + session.role
            + ". Gọi đúng người có quyền để tiếp.",
        };
      }
      const {
        path: docPath,
        title,
        audience,
        sensitivity,
        tags,
        owner,
        body,
        rationale,
      } = input as {
        path: string;
        title: string;
        audience: Role[];
        sensitivity?: Sensitivity;
        tags?: string[];
        owner?: string;
        body: string;
        rationale: string;
      };
      const today = new Date().toISOString().slice(0, 10);
      const fm: EditableFM = {
        title,
        owner: owner ?? session.email,
        audience,
        sensitivity: sensitivity ?? "internal",
        tags: tags ?? [],
        last_reviewed: today,
        reviewer: session.email,
        status: "approved",
      };
      try {
        const meta = createDoc({ path: docPath, fm, body });
        await writeAudit({
          actorEmail: session.email,
          role: session.role,
          action: "commit_update",
          docId: meta.id,
          answerExcerpt: `CREATE: ${rationale}`,
          metadata: { created: true, path: meta.path, title: meta.title },
        });
        return {
          content: `Đã tạo tài liệu mới: "${meta.title}" tại ${meta.path} (id ${meta.id}). Chatbot sẽ tra cứu được ngay.`,
          citations: [meta.path],
          citationRefs: [
            {
              docId: meta.id,
              path: meta.path,
              heading: "",
              title: meta.title,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof EditorError ? err.message : "Lỗi tạo doc";
        return { content: `Không tạo được: ${msg}` };
      }
    }

    case "suggest_training": {
      const { slug, topic } = input as { slug?: string; topic?: string };
      if (slug) {
        const p = getPathBySlug(slug, session.role);
        if (!p) {
          return {
            content: `Không có lộ trình "${slug}" hoặc role ${session.role} không có quyền xem.`,
          };
        }
        return {
          content: JSON.stringify({
            found: 1,
            paths: [
              {
                slug: p.slug,
                title: p.title,
                subtitle: p.subtitle,
                duration: p.duration,
                total_steps: p.total_steps,
                url: `/training/${p.slug}`,
              },
            ],
            hint: `Trả link dạng [${p.title}](/training/${p.slug}) để user click.`,
          }),
        };
      }
      let paths = getPathsForRole(session.role);
      if (topic) {
        const needle = topic.toLowerCase();
        paths = paths.filter(
          (p) =>
            p.slug.toLowerCase().includes(needle) ||
            p.title.toLowerCase().includes(needle) ||
            (p.subtitle ?? "").toLowerCase().includes(needle)
        );
      }
      return {
        content: JSON.stringify({
          found: paths.length,
          role: session.role,
          paths: paths.map((p) => ({
            slug: p.slug,
            title: p.title,
            subtitle: p.subtitle,
            duration: p.duration,
            total_steps: p.total_steps,
            url: `/training/${p.slug}`,
          })),
          hint: "Với mỗi path, trả markdown link clickable [title](/training/slug) kèm mô tả ngắn.",
        }),
      };
    }

    case "hard_delete_document": {
      if (!canWriteDirect(session.role)) {
        return {
          content:
            "Xoá vĩnh viễn chỉ dành cho admin. Role hiện tại không đủ quyền.",
        };
      }
      const { id, password, reason } = input as {
        id: string;
        password: string;
        reason: string;
      };
      try {
        const res = hardDeleteDoc(id, password);
        // Audit — KHÔNG log password.
        await writeAudit({
          actorEmail: session.email,
          role: session.role,
          action: "commit_update",
          docId: id,
          answerExcerpt: `HARD DELETE via chat: ${reason}`,
          metadata: { hard_delete: true, path: res.deleted },
        });
        return {
          content: `Đã XOÁ VĨNH VIỄN: ${res.deleted}. Không khôi phục được. Audit đã ghi: ${session.email} · lý do: ${reason}`,
        };
      } catch (err) {
        const msg =
          err instanceof EditorError ? err.message : "Lỗi xoá vĩnh viễn";
        await writeAudit({
          actorEmail: session.email,
          role: session.role,
          action: "commit_update",
          docId: id,
          answerExcerpt: "HARD DELETE REJECTED",
          metadata: { hard_delete: false, reason: msg },
        });
        return {
          content: `Bị chặn: ${msg}. Nếu thực sự cần xoá, liên hệ trực tiếp sếp Huy xin lại password.`,
        };
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
