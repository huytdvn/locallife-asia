import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local Life Asia — Nội bộ",
  description: "Trợ lý AI nội bộ của Local Life Asia",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
