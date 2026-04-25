"use client";

import { useMemo, useState } from "react";

export interface DocNode {
  id: string;
  title: string;
  path: string;
  status: "draft" | "approved" | "deprecated";
  sensitivity: "public" | "internal" | "restricted";
  audience: string[];
  last_reviewed: string;
}

interface FolderNode {
  name: string;
  label: string;
  path: string; // prefix relative to knowledge/
  docs: DocNode[]; // direct children
  folders: Record<string, FolderNode>;
}

function emptyFolder(name: string, label: string, path: string): FolderNode {
  return { name, label, path, docs: [], folders: {} };
}

const ZONE_LABEL: Record<string, string> = {
  internal: "Nội bộ",
  host: "Host",
  lok: "LOK",
  public: "Công khai",
  inbox: "Inbox (chưa phân loại)",
};
const DEPT_LABEL: Record<string, string> = {
  "00-company": "Công ty",
  "10-hr": "Nhân sự",
  "20-operations": "Vận hành",
  "30-product": "Sản phẩm",
  "40-partners": "Đối tác",
  "50-finance": "Tài chính",
  onboarding: "Onboarding",
  standards: "Tiêu chuẩn",
  policies: "Chính sách",
  program: "Chương trình",
  training: "Đào tạo",
  about: "Giới thiệu",
  terms: "Điều khoản",
  faq: "FAQ",
  forms: "Biểu mẫu",
  processes: "Quy trình",
  playbooks: "Playbook",
  homestay: "Homestay",
  experiences: "Trải nghiệm",
  marketplace: "Marketplace",
  "homestay-hosts": "Host",
  artisans: "Nghệ nhân",
  suppliers: "Nhà cung cấp",
};

function labelFor(seg: string, depth: number): string {
  if (depth === 0) return ZONE_LABEL[seg] ?? seg;
  if (depth === 1) return DEPT_LABEL[seg] ?? seg;
  return DEPT_LABEL[seg] ?? seg;
}

function buildTree(docs: DocNode[]): FolderNode {
  const root = emptyFolder("", "Knowledge", "");
  for (const d of docs) {
    const parts = d.path.split("/");
    const fileName = parts.pop() ?? d.path;
    let node = root;
    let cumulative = "";
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      cumulative = cumulative ? `${cumulative}/${seg}` : seg;
      if (!node.folders[seg]) {
        node.folders[seg] = emptyFolder(seg, labelFor(seg, i), cumulative);
      }
      node = node.folders[seg];
    }
    node.docs.push(d);
    void fileName;
  }
  return root;
}

function countDocs(folder: FolderNode): number {
  let c = folder.docs.length;
  for (const f of Object.values(folder.folders)) c += countDocs(f);
  return c;
}

interface Props {
  docs: DocNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
}

export function DocsTree({ docs, selectedId, onSelect, search }: Props) {
  const tree = useMemo(() => buildTree(docs), [docs]);
  const q = search.trim().toLowerCase();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: 4,
      }}
    >
      {Object.values(tree.folders)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((top) => (
          <FolderBranch
            key={top.path}
            folder={top}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            query={q}
            forceOpen={!!q}
          />
        ))}
      {docs.length === 0 && (
        <div
          style={{
            padding: 12,
            color: "var(--ll-muted)",
            fontSize: 13,
          }}
        >
          Chưa có tài liệu nào.
        </div>
      )}
    </div>
  );
}

function FolderBranch({
  folder,
  depth,
  selectedId,
  onSelect,
  query,
  forceOpen,
}: {
  folder: FolderNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  forceOpen: boolean;
}) {
  const [open, setOpen] = useState(depth < 1);
  const total = countDocs(folder);
  const isOpen = forceOpen || open;

  const matchingDocs = query
    ? folder.docs.filter(
        (d) =>
          d.title.toLowerCase().includes(query) ||
          d.path.toLowerCase().includes(query)
      )
    : folder.docs;

  const hasVisibleContent =
    !query ||
    matchingDocs.length > 0 ||
    Object.values(folder.folders).some((f) => folderMatches(f, query));

  if (!hasVisibleContent) return null;

  const color = ZONE_COLOR[folder.name];
  const paddingLeft = 8 + depth * 14;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: `6px 8px 6px ${paddingLeft}px`,
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          borderRadius: 4,
          transition: "background 120ms var(--ll-ease)",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.background =
            "var(--ll-surface-soft)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "transparent")
        }
      >
        <span
          style={{
            display: "inline-block",
            width: 12,
            color: "var(--ll-muted)",
            fontSize: 10,
            transition: "transform 120ms var(--ll-ease)",
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          ▶
        </span>
        {color && (
          <span
            style={{
              width: 4,
              height: 14,
              borderRadius: 2,
              background: color,
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            fontSize: 13,
            fontWeight: depth === 0 ? 600 : 500,
            color:
              depth === 0 ? "var(--ll-ink)" : "var(--ll-ink)",
            flex: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {folder.label}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--ll-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {total}
        </span>
      </button>
      {isOpen && (
        <div>
          {Object.values(folder.folders)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((sub) => (
              <FolderBranch
                key={sub.path}
                folder={sub}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                query={query}
                forceOpen={forceOpen}
              />
            ))}
          {matchingDocs
            .slice()
            .sort((a, b) => a.title.localeCompare(b.title, "vi"))
            .map((d) => (
              <DocLeaf
                key={d.id}
                doc={d}
                depth={depth + 1}
                selected={d.id === selectedId}
                onSelect={onSelect}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function DocLeaf({
  doc,
  depth,
  selected,
  onSelect,
}: {
  doc: DocNode;
  depth: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const paddingLeft = 8 + depth * 14 + 12;
  return (
    <button
      type="button"
      onClick={() => onSelect(doc.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: `5px 8px 5px ${paddingLeft}px`,
        width: "100%",
        background: selected ? "var(--ll-green-soft)" : "transparent",
        border: "none",
        borderLeft: selected
          ? "3px solid var(--ll-green)"
          : "3px solid transparent",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        transition: "background 120ms var(--ll-ease)",
      }}
      onMouseEnter={(e) => {
        if (!selected)
          (e.currentTarget as HTMLElement).style.background =
            "var(--ll-surface-soft)";
      }}
      onMouseLeave={(e) => {
        if (!selected)
          (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <DocIcon status={doc.status} />
      <span
        style={{
          fontSize: 12.5,
          color: selected ? "var(--ll-green-dark)" : "var(--ll-ink)",
          fontWeight: selected ? 600 : 400,
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={doc.title}
      >
        {doc.title}
      </span>
      {doc.sensitivity === "restricted" && (
        <span
          aria-hidden
          title="Restricted"
          style={{
            fontSize: 10,
            color: "#b91c1c",
          }}
        >
          🔒
        </span>
      )}
      {doc.status === "draft" && (
        <span
          className="ll-badge"
          style={{
            background: "var(--ll-orange-soft)",
            color: "#c07600",
            fontSize: 9,
            padding: "1px 6px",
          }}
        >
          DRAFT
        </span>
      )}
    </button>
  );
}

function DocIcon({ status }: { status: DocNode["status"] }) {
  const color =
    status === "deprecated"
      ? "var(--ll-muted)"
      : status === "draft"
        ? "var(--ll-orange)"
        : "var(--ll-green)";
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path
        d="M3 2.5A1.5 1.5 0 014.5 1H10l3 3v8.5A1.5 1.5 0 0111.5 14H4.5A1.5 1.5 0 013 12.5v-10z"
        stroke={color}
        strokeWidth="1.4"
      />
      <path d="M10 1v3h3" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

function folderMatches(folder: FolderNode, q: string): boolean {
  for (const d of folder.docs) {
    if (
      d.title.toLowerCase().includes(q) ||
      d.path.toLowerCase().includes(q)
    )
      return true;
  }
  for (const f of Object.values(folder.folders)) {
    if (folderMatches(f, q)) return true;
  }
  return false;
}

const ZONE_COLOR: Record<string, string> = {
  internal: "var(--ll-zone-internal)",
  host: "var(--ll-zone-host)",
  lok: "var(--ll-zone-lok)",
  public: "var(--ll-zone-public)",
  inbox: "var(--ll-orange)",
};
