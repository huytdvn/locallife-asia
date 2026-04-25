import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Mọi route cần login (JWT cookie hoặc dev bypass).
const PROTECTED = [
  /^\/$/,
  /^\/dashboard/,
  /^\/admin/,
  /^\/api\/chat/,
  /^\/api\/admin/,
  /^\/api\/training/,
  /^\/api\/raw/,
  /^\/host/,
  /^\/lok/,
  /^\/public/,
  /^\/training/,
];
const IS_PROD = process.env.NODE_ENV === "production";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((r) => r.test(pathname))) {
    return NextResponse.next();
  }

  if (!IS_PROD && req.headers.get("x-dev-role")) {
    return NextResponse.next();
  }

  const hasSession =
    req.cookies.get("authjs.session-token") ??
    req.cookies.get("__Secure-authjs.session-token");

  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/admin/:path*",
    "/api/chat/:path*",
    "/api/admin/:path*",
    "/api/training/:path*",
    "/api/raw/:path*",
    "/host/:path*",
    "/lok/:path*",
    "/public/:path*",
    "/training/:path*",
  ],
};
