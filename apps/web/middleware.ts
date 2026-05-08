import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes requiring login (JWT cookie or dev bypass).
//
// /host, /lok, /public are NO LONGER protected here — those pages render an
// anonymous portal when the visitor has no session, and the chat client
// forwards a `publicAs` hint to /api/chat which the route handler validates
// itself (see app/api/chat/route.ts). Middleware-level redirect would
// short-circuit the public flow before page render.
const PROTECTED = [
  /^\/$/,
  /^\/dashboard/,
  /^\/admin/,
  /^\/api\/admin/,
  /^\/api\/training/,
  /^\/api\/raw/,
  /^\/training/,
];

// Widget + public-chat endpoints — auth handled inside the route, NOT at
// middleware. /api/chat falls back to anon publicAs when no session.
const PUBLIC_BYPASS = [
  /^\/api\/chat$/,
  /^\/api\/chat\/widget$/,
  /^\/api\/widget\//,
  /^\/widget\.js$/,
  /^\/widget\.css$/,
];
const IS_PROD = process.env.NODE_ENV === "production";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_BYPASS.some((r) => r.test(pathname))) {
    return NextResponse.next();
  }
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
    "/api/admin/:path*",
    "/api/training/:path*",
    "/api/raw/:path*",
    "/training/:path*",
  ],
};
