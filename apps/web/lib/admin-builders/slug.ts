/**
 * Slugify Vietnamese-aware → ASCII anchor for heading lookup.
 *
 * Phải khớp với cách MDX/markdown anchor hoạt động (lowercase, dấu cách → -,
 * loại dấu + ký tự đặc biệt). Chunker hiện tại lưu raw heading text
 * (`heading: "Sứ mệnh"`); đây là step normalize để client tạo URL fragment
 * `#su-menh` đi tới đúng đoạn.
 */
export function slugifyHeading(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
