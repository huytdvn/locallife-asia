/**
 * Flat line SVG icons cho nav top bar — lucide-style:
 * stroke-only, stroke-width 1.75, currentColor, viewBox 24×24, square caps.
 *
 * Inline thay vì add dependency mới (lucide-react ~50KB) cho 7 icon.
 * Caller truyền `size` (default 20). currentColor inherit từ parent.
 */

type IconProps = { size?: number };

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IconDashboard({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

export function IconChat({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M21 12a8 8 0 0 1-8 8 8.5 8.5 0 0 1-3.6-.8L3 21l1.3-4A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

export function IconRoute({ size = 20 }: IconProps) {
  // Compass-like — phù hợp "Lộ trình"
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-3 6-6 3 3-6Z" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconTarget({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconHome({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 11 12 3l9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

export function IconStar({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m12 3 2.6 5.6 6 .6-4.5 4.2 1.3 6L12 16.6 6.6 19.4l1.3-6L3.4 9.2l6-.6Z" />
    </svg>
  );
}

export function IconGlobe({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z" />
    </svg>
  );
}

export const NAV_ICONS = {
  dashboard: IconDashboard,
  chat: IconChat,
  route: IconRoute,
  target: IconTarget,
  home: IconHome,
  star: IconStar,
  globe: IconGlobe,
} as const;

export type NavIconKey = keyof typeof NAV_ICONS;

/**
 * Color theo ý nghĩa từng icon, hợp với LL palette (xanh lá làm chủ đạo,
 * cam/đỏ/tím cho accent). Inactive: icon nhuộm fg, bg pastel rất nhẹ.
 * Active state ở component cha override hết.
 */
export const ICON_ACCENTS: Record<NavIconKey, { fg: string; bg: string }> = {
  dashboard: { fg: "#0d9488", bg: "#ccfbf1" }, // teal — analytics
  chat:      { fg: "#0284c7", bg: "#e0f2fe" }, // sky — AI vibes
  route:     { fg: "#c2410c", bg: "#ffedd5" }, // orange — adventure
  target:    { fg: "#be185d", bg: "#fce7f3" }, // pink — game
  home:      { fg: "#b45309", bg: "#fef3c7" }, // amber — warm home
  star:      { fg: "#7c3aed", bg: "#ede9fe" }, // purple — celebrity
  globe:     { fg: "#059669", bg: "#d1fae5" }, // emerald — earth
};

export function NavIcon({ name, size }: { name: NavIconKey; size?: number }) {
  const Cmp = NAV_ICONS[name];
  return <Cmp size={size} />;
}
