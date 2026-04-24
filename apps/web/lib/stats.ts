import { loadKnowledge, type LoadedDoc } from "@/lib/knowledge-loader";
import { canRead, type Role } from "@/lib/rbac";

export interface KnowledgeStats {
  totalVisible: number;
  byDepartment: Array<{ dept: string; count: number; share: number }>;
  bySensitivity: { public: number; internal: number; restricted: number };
  recentlyReviewed: Array<{ path: string; title: string; last_reviewed: string }>;
  staleCount: number;
  coveragePercent: number;
  owners: Map<string, number>;
  motivationalTip: string;
}

const DEPT_LABELS: Record<string, string> = {
  "00-company": "Công ty",
  "10-hr": "Nhân sự",
  "20-operations": "Vận hành",
  "30-product": "Sản phẩm",
  "40-partners": "Đối tác",
  "50-finance": "Tài chính",
  "90-archive": "Lưu trữ",
};

export function deptLabel(path: string): string {
  const prefix = path.split("/")[0];
  return DEPT_LABELS[prefix] ?? prefix;
}

export function computeStats(role: Role): KnowledgeStats {
  const docs = loadKnowledge();
  const visible = docs.filter((d) => canRead(role, d.meta));

  const byDept = new Map<string, number>();
  const bySens = { public: 0, internal: 0, restricted: 0 };
  const owners = new Map<string, number>();
  const reviewed: Array<{ path: string; title: string; last_reviewed: string }> = [];
  let stale = 0;
  const today = new Date();
  const THRESHOLD_DAYS = 90;

  for (const d of visible) {
    const dept = deptLabel(d.meta.path);
    byDept.set(dept, (byDept.get(dept) ?? 0) + 1);
    bySens[d.meta.sensitivity] = (bySens[d.meta.sensitivity] ?? 0) + 1;
    if (d.meta.owner) owners.set(d.meta.owner, (owners.get(d.meta.owner) ?? 0) + 1);
    if (d.meta.last_reviewed) {
      reviewed.push({
        path: d.meta.path,
        title: d.meta.title,
        last_reviewed: d.meta.last_reviewed,
      });
      const reviewed_at = new Date(d.meta.last_reviewed);
      const ageDays = (today.getTime() - reviewed_at.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > THRESHOLD_DAYS) stale++;
    }
  }

  reviewed.sort((a, b) => (a.last_reviewed < b.last_reviewed ? 1 : -1));

  const total = visible.length;
  const deptArr = [...byDept.entries()]
    .map(([dept, count]) => ({ dept, count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);

  const coveragePercent = total > 0 ? Math.round(((total - stale) / total) * 100) : 100;

  return {
    totalVisible: total,
    byDepartment: deptArr,
    bySensitivity: bySens,
    recentlyReviewed: reviewed.slice(0, 5),
    staleCount: stale,
    coveragePercent,
    owners,
    motivationalTip: pickTip(docs, role),
  };
}

const TIPS: Array<{ tag: string; tip: string }> = [
  {
    tag: "onboarding",
    tip: "Bạn biết không? Lộ trình 30-60-90 được thiết kế để mỗi người mới đều có người đồng hành — đừng ngại hỏi.",
  },
  {
    tag: "values",
    tip: "Giá trị ‘Địa phương trước’ không chỉ là slogan — mỗi quyết định về partner đều bắt đầu từ đó.",
  },
  {
    tag: "homestay",
    tip: "Mỗi homestay trong hệ thống đều được 1 người trong team trực tiếp ghé thăm trước khi lên platform.",
  },
  {
    tag: "leave",
    tip: "Nghỉ phép không phải xin ‘nếu cần’ — đó là quyền. Sắp đến cuối tuần rồi, hãy lên lịch nghỉ ngơi nhé.",
  },
  {
    tag: "partnership",
    tip: "Hợp tác với nghệ nhân là hành trình dài. Câu chuyện của họ chính là câu chuyện sản phẩm.",
  },
];

function pickTip(docs: LoadedDoc[], role: Role): string {
  void role;
  // Determine pool theo availability of doc containing tag
  const available = TIPS.filter((t) =>
    docs.some((d) => d.meta.tags.includes(t.tag))
  );
  const pool = available.length ? available : TIPS;
  // Use date seed so tip xoay mỗi ngày, không random mỗi render
  const dayKey = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return pool[dayKey % pool.length].tip;
}

export function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

export function starterQuestions(role: Role): string[] {
  const base = [
    "Làm sao xin nghỉ phép?",
    "Quy trình onboarding homestay mới gồm mấy bước?",
    "Tiêu chuẩn homestay Local Life gồm gì?",
    "Khi khách huỷ booking thì hoàn tiền thế nào?",
    "Giá trị cốt lõi của công ty là gì?",
  ];
  if (role === "admin" || role === "lead") {
    base.push(
      "Công ty giữ bao nhiêu phần trăm commission?",
      "Cơ cấu chi phí nội bộ ra sao?"
    );
  }
  return base;
}
