import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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

// OTP setup flow — internal users with `needsOtpSetup` must finish here
// before they're allowed back into the rest of the app. These paths
// stay accessible so the redirect doesn't loop.
const OTP_SETUP_BYPASS = [
  /^\/profile/,                    // /profile + /profile/otp-setup + change-password
  /^\/api\/profile\//,             // OTP generate/verify-enroll + change-password
  /^\/login/,                      // signing out from setup mid-way
  /^\/api\/auth\//,                // sign out
];

// Password change flow — same bypass list (đụng vào nhau, ưu tiên đổi pw trước OTP).
const PW_CHANGE_BYPASS = OTP_SETUP_BYPASS;
const IS_PROD = process.env.NODE_ENV === "production";

export async function middleware(req: NextRequest) {
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

  // 2 gate liên tiếp: password change trước (cao priority — admin tạm), rồi OTP.
  // Cùng bypass list — paths /profile/*, /api/profile/*, /login, /api/auth/*.
  const inBypass =
    OTP_SETUP_BYPASS.some((r) => r.test(pathname)) ||
    PW_CHANGE_BYPASS.some((r) => r.test(pathname));

  if (!inBypass) {
    try {
      const token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
      });
      if (token?.needsPasswordChange) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "password_change_required" },
            { status: 403 }
          );
        }
        const url = req.nextUrl.clone();
        url.pathname = "/profile/change-password";
        url.search = "";
        return NextResponse.redirect(url);
      }
      if (token?.needsOtpSetup) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "otp_setup_required" },
            { status: 403 }
          );
        }
        const url = req.nextUrl.clone();
        url.pathname = "/profile/otp-setup";
        url.search = "";
        return NextResponse.redirect(url);
      }
    } catch {
      // getToken can't decode (corrupt cookie / secret rotated). Fall
      // through; auth() in the page will surface the actual error.
    }
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
    "/profile/:path*",
    "/api/profile/:path*",
  ],
};
