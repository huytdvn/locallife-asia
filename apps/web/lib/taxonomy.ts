/**
 * Taxonomy shared giữa re-organize.py và UI. Phải đồng bộ.
 * Nếu đổi ở 1 chỗ, đổi cả 2.
 */

export type ZoneKey = "internal" | "host" | "lok" | "public";

export interface DeptDef {
  key: string;
  name: string;
  subfolders: string[];
}

export interface ZoneDef {
  key: ZoneKey;
  name: string;
  audience_default: string[];
  depts: DeptDef[];
}

export const TAXONOMY: ZoneDef[] = [
  {
    key: "internal",
    name: "Nội bộ (staff)",
    audience_default: ["employee", "lead", "admin"],
    depts: [
      { key: "00-company", name: "Công ty / Brand", subfolders: [] },
      {
        key: "10-hr",
        name: "Nhân sự",
        subfolders: ["onboarding", "policies", "forms"],
      },
      {
        key: "20-operations",
        name: "Vận hành",
        subfolders: ["processes", "playbooks"],
      },
      {
        key: "30-product",
        name: "Sản phẩm",
        subfolders: ["homestay", "experiences", "marketplace"],
      },
      {
        key: "40-partners",
        name: "Đối tác (meta)",
        subfolders: ["homestay-hosts", "artisans", "suppliers"],
      },
      { key: "50-finance", name: "Tài chính / Pháp lý", subfolders: [] },
    ],
  },
  {
    key: "host",
    name: "Host Portal",
    audience_default: ["host", "lead", "admin"],
    depts: [
      { key: "onboarding", name: "Onboarding Host", subfolders: [] },
      { key: "standards", name: "Tiêu chuẩn", subfolders: [] },
      { key: "policies", name: "Chính sách Host", subfolders: [] },
      { key: "faq", name: "FAQ Host", subfolders: [] },
    ],
  },
  {
    key: "lok",
    name: "LOK Partner Portal",
    audience_default: ["lok", "lead", "admin"],
    depts: [
      { key: "program", name: "Chương trình LOK", subfolders: [] },
      { key: "onboarding", name: "Onboarding LOK", subfolders: [] },
      { key: "training", name: "Đào tạo LOK", subfolders: [] },
      { key: "faq", name: "FAQ LOK", subfolders: [] },
    ],
  },
  {
    key: "public",
    name: "Công khai",
    audience_default: ["employee", "lead", "admin", "host", "lok", "guest"],
    depts: [
      { key: "about", name: "Giới thiệu", subfolders: [] },
      { key: "terms", name: "Điều khoản", subfolders: [] },
      { key: "faq", name: "FAQ chung", subfolders: [] },
    ],
  },
];

export function getZone(key: string): ZoneDef | undefined {
  return TAXONOMY.find((z) => z.key === key);
}
