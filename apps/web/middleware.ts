import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const PROTECTED_PATHS = [/^\/api\/chat/, /^\/admin/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED_PATHS.some((r) => r.test(pathname))) {
    return NextResponse.next();
  }

  // Dev bypass: X-Dev-Role header lets local curl hit /api/chat without SSO.
  if (
    process.env.NODE_ENV !== "production" &&
    req.headers.get("x-dev-role")
  ) {
    return NextResponse.next();
  }

  const session = await auth();
  if (!session?.user?.email) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 }
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/chat/:path*", "/admin/:path*"],
};
