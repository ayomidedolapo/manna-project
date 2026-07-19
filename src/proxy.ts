import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const CUSTOMER_COOKIE_NAME = "manna_token";
const ADMIN_COOKIE_NAME = "manna_admin_token";

const ADMIN_TOKEN_SCOPE = "MANNA_ADMIN_ACCESS";
const ADMIN_TOKEN_ISSUER = "manna";
const ADMIN_TOKEN_AUDIENCE = "manna-admin";

// Routes intentionally protected by their own secret or external verification.
function isBypassedApiRoute(pathname: string) {
  if (pathname === "/api/webhooks/kwik") return true;
  if (pathname === "/api/cron/kwik-sync") return true;

  if (
    pathname.startsWith("/api/orders/") &&
    pathname.endsWith("/tracking")
  ) {
    return true;
  }

  return false;
}

// Backend Console pages.
function isConsolePageRoute(pathname: string) {
  return (
    pathname === "/admin/api-console" ||
    pathname.startsWith("/admin/api-console/")
  );
}

// Backend Console internal APIs.
function isConsoleApiRoute(pathname: string) {
  return pathname.startsWith("/api/internal/api-console");
}

// These must remain public so an admin can create a console session.
function isPublicConsoleRoute(pathname: string) {
  return (
    pathname === "/admin/api-console/login" ||
    pathname === "/api/internal/api-console/auth/login"
  );
}

// Existing admin routes remain on the present customer-token system for now.
// The Backend Console is excluded because it has its own separate admin session.
function isAdminRoute(pathname: string) {
  return (
    (pathname.startsWith("/admin") && !isConsolePageRoute(pathname)) ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/internal") ||
    pathname.startsWith("/api/debug")
  );
}

function isAuthRoute(pathname: string) {
  return (
    pathname.startsWith("/api/orders") ||
    pathname.startsWith("/api/my") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/orders")
  );
}

/*
  Customer-token verification.
  This preserves the current manna_token + JWT_SECRET system.
*/
async function verifyCustomerToken(token: string) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }

  const key = new TextEncoder().encode(secret);

  const { payload } = await jwtVerify(token, key, {
    algorithms: ["HS256"],
  });

  return {
    userId: typeof payload.sub === "string" ? payload.sub : null,
    role: typeof payload.role === "string" ? payload.role : null,
  };
}

/*
  Separate admin-token verification for the Backend Console and future
  Manna internal admin systems.

  Middleware uses jose directly because middleware must remain Edge-compatible.
  Do not import src/lib/auth.ts here because it imports bcrypt/jsonwebtoken.
*/
async function verifyAdminToken(token: string) {
  const secret = process.env.MANNA_ADMIN_JWT_SECRET;

  if (!secret) {
    throw new Error("MANNA_ADMIN_JWT_SECRET is not set");
  }

  const key = new TextEncoder().encode(secret);

  const { payload } = await jwtVerify(token, key, {
    algorithms: ["HS256"],
    issuer: ADMIN_TOKEN_ISSUER,
    audience: ADMIN_TOKEN_AUDIENCE,
  });

  if (
    typeof payload.sub !== "string" ||
    payload.role !== "ADMIN" ||
    payload.scope !== ADMIN_TOKEN_SCOPE
  ) {
    return null;
  }

  return {
    userId: payload.sub,
    role: "ADMIN" as const,
  };
}

function redirectToCustomerLogin(req: NextRequest, clearCookie = false) {
  const url = new URL("/login", req.url);

  url.searchParams.set(
    "next",
    `${req.nextUrl.pathname}${req.nextUrl.search}`
  );

  const response = NextResponse.redirect(url);

  if (clearCookie) {
    response.cookies.set(CUSTOMER_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}

function redirectToConsoleLogin(req: NextRequest, clearCookie = false) {
  const url = new URL("/admin/api-console/login", req.url);

  url.searchParams.set(
    "next",
    `${req.nextUrl.pathname}${req.nextUrl.search}`
  );

  const response = NextResponse.redirect(url);

  if (clearCookie) {
    response.cookies.set(ADMIN_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip framework/static routes.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico")
  ) {
    return NextResponse.next();
  }

  // External/system routes that self-authenticate.
  if (isBypassedApiRoute(pathname)) {
    return NextResponse.next();
  }

  /*
    BACKEND CONSOLE AUTHENTICATION

    This runs before the older /admin guard, ensuring
    /admin/api-console/login never redirects to /login.
  */
  if (isPublicConsoleRoute(pathname)) {
    return NextResponse.next();
  }

  if (isConsolePageRoute(pathname) || isConsoleApiRoute(pathname)) {
    const adminToken = req.cookies.get(ADMIN_COOKIE_NAME)?.value;

    if (!adminToken) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { message: "Admin console authentication required" },
          { status: 401 }
        );
      }

      return redirectToConsoleLogin(req);
    }

    try {
      const adminSession = await verifyAdminToken(adminToken);

      if (!adminSession) {
        throw new Error("Invalid admin session");
      }

      return NextResponse.next();
    } catch {
      if (pathname.startsWith("/api/")) {
        const response = NextResponse.json(
          { message: "Admin console authentication required" },
          { status: 401 }
        );

        response.cookies.set(ADMIN_COOKIE_NAME, "", {
          path: "/",
          maxAge: 0,
        });

        return response;
      }

      return redirectToConsoleLogin(req, true);
    }
  }

  // Existing public customer pages and customer auth routes.
  if (
    pathname.startsWith("/agent-login") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  /*
    EXISTING CUSTOMER / LEGACY ADMIN AUTHENTICATION

    This keeps your current manna_token behaviour unchanged.
  */
  const customerToken = req.cookies.get(CUSTOMER_COOKIE_NAME)?.value;

  const needsCustomerAuth =
    isAdminRoute(pathname) || isAuthRoute(pathname);

  if (needsCustomerAuth && !customerToken) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    return redirectToCustomerLogin(req);
  }

  if (needsCustomerAuth && customerToken) {
    try {
      const { role } = await verifyCustomerToken(customerToken);

      if (isAdminRoute(pathname) && role !== "ADMIN") {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { message: "Forbidden" },
            { status: 403 }
          );
        }

        return NextResponse.redirect(new URL("/", req.url));
      }

      return NextResponse.next();
    } catch {
      if (pathname.startsWith("/api/")) {
        const response = NextResponse.json(
          { message: "Unauthorized" },
          { status: 401 }
        );

        response.cookies.set(CUSTOMER_COOKIE_NAME, "", {
          path: "/",
          maxAge: 0,
        });

        return response;
      }

      return redirectToCustomerLogin(req, true);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};