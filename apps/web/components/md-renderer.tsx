"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AnchorHTMLAttributes } from "react";

/**
 * Markdown renderer + link transform:
 * - href "internal/..." | "host/..." | "lok/..." | "public/..." / "inbox/..."
 *   → rewrite to "/admin/docs?doc=<path>" (mở tree manager + select doc)
 * - href "kb:<path>" | "doc:<id>" → shorthand tương tự
 * - External http(s) / mailto: giữ nguyên, mở tab mới
 * - Preserve fragment "#heading"
 */
export function MdRenderer({ children }: { children: string }) {
  return (
    <div className="ll-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: kids, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
            const original = href ?? "";
            const { url, external } = normalizeHref(original);
            return (
              <a
                href={url}
                {...(external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                {...rest}
              >
                {kids}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function normalizeHref(href: string): { url: string; external: boolean } {
  if (!href) return { url: "#", external: false };
  // External
  if (/^(https?:|mailto:|tel:|ftp:)/i.test(href)) {
    return { url: href, external: true };
  }
  // doc:<ULID>
  const docMatch = /^doc:([0-9A-Z]{26})(#.*)?$/.exec(href);
  if (docMatch) {
    return { url: `/admin/docs?doc=${docMatch[1]}${docMatch[2] ?? ""}`, external: false };
  }
  // kb:<path>
  if (href.startsWith("kb:")) {
    const rest = href.slice(3);
    return { url: `/admin/docs?path=${encodeURIComponent(rest)}`, external: false };
  }
  // Zone-prefixed path (internal/... host/... lok/... public/... inbox/...)
  if (/^(internal|host|lok|public|inbox)\//.test(href)) {
    const [pathPart, ...fragParts] = href.split("#");
    const frag = fragParts.length ? `#${fragParts.join("#")}` : "";
    return {
      url: `/admin/docs?path=${encodeURIComponent(pathPart)}${frag}`,
      external: false,
    };
  }
  // Relative / anchor
  return { url: href, external: false };
}
