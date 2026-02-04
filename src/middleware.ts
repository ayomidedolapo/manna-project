import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "manna_token";

function isAdminRoute(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
}

function isAuthRoute(pathname: string) {
  // pages/routes that require login (add/remove as you like)
  return (
    pathname.startsWith("/api/orders") ||
    pathname.startsWith("/api/my") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/orders")
  );
}

async function verifyToken(token: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");

  const key = new TextEncoder().encode(secret);

  // Your token was signed with HS256 in your auth code (JWT_SECRET)
  const { payload } = await jwtVerify(token, key);

  // payload.sub is userId, payload.role is role
  return {
    userId: typeof payload.sub === "string" ? payload.sub : null,
    role: typeof payload.role === "string" ? payload.role : null,
  };
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip Next internals
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon.ico")) {
    return NextResponse.next();
  }

  // Public routes allowed (login/register pages + auth endpoints)
  if (
    pathname.startsWith("/agent-login") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;

  const needsAuth = isAdminRoute(pathname) || isAuthRoute(pathname);

  // If the route is protected and there is no token
  if (needsAuth && !token) {
    // API -> return 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Page -> redirect to login
    const url = req.nextUrl.clone();
    url.pathname = "/login"; // change if your login page is /agent-login etc.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // If token exists, validate it (for protected routes)
  if (needsAuth && token) {
    try {
      const { role } = await verifyToken(token);

      // Admin check
      if (isAdminRoute(pathname) && role !== "ADMIN") {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }

        const url = req.nextUrl.clone();
        url.pathname = "/"; // or "/dashboard"
        return NextResponse.redirect(url);
      }

      return NextResponse.next();
    } catch {
      // Invalid/expired token
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }

      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);

      // Clear cookie
      const res = NextResponse.redirect(url);
      res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
      return res;
    }
  }

  // Public route: allow
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Apply middleware to everything except static assets
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
