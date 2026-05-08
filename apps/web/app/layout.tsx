import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bé Tre · Trợ lý Local Life",
  description:
    "Bé Tre — trợ lý AI nội bộ của Local Life Asia. Hỏi gì cũng được, trả lời kèm nguồn tài liệu.",
  applicationName: "Bé Tre",
  appleWebApp: {
    capable: true,
    title: "Bé Tre",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Bé Tre · Trợ lý Local Life",
    description: "Trợ lý AI nội bộ thân thiện của Local Life Asia.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0d6e3e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
