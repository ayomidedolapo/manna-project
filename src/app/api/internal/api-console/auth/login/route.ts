import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_AUTH_MAX_AGE_SECONDS,
  signAdminAuthToken,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

type AdminLoginBody = {
  email?: unknown;
  phone?: unknown;
  password?: unknown;
};

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_LOGIN_REQUEST_BYTES = 8 * 1024;

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { ok: false, message: "Request must use application/json." },
        { status: 415 }
      );
    }

    const rawBody = await req.text();

    if (Buffer.byteLength(rawBody, "utf8") > MAX_LOGIN_REQUEST_BYTES) {
      return NextResponse.json(
        { ok: false, message: "Sign-in request is too large." },
        { status: 413 }
      );
    }

    let body: AdminLoginBody;

    try {
      body = JSON.parse(rawBody) as AdminLoginBody;
    } catch {
      return NextResponse.json(
        { ok: false, message: "Request body must be valid JSON." },
        { status: 400 }
      );
    }

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const phone =
      typeof body.phone === "string"
        ? body.phone.trim()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!password || (!email && !phone) || (email && phone)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Enter one email or phone number and a password.",
        },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: email ? [{ email }] : [{ phone }],
      },
    });

    // Generic response prevents account/admin-role enumeration.
    if (!user || user.role !== "ADMIN" || !user.passwordHash) {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid administrator credentials.",
        },
        { status: 401 }
      );
    }

    const now = new Date();

    if (user.adminLockedUntil && user.adminLockedUntil > now) {
      return NextResponse.json(
        {
          ok: false,
          message: "Too many sign-in attempts. Please try again later.",
        },
        { status: 429 }
      );
    }

    const validPassword = await verifyPassword(
      password,
      user.passwordHash
    );

    if (!validPassword) {
      const previousFailures =
        user.adminLockedUntil && user.adminLockedUntil <= now
          ? 0
          : user.adminFailedLoginCount;

      const nextFailures = previousFailures + 1;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          adminFailedLoginCount: nextFailures,
          adminLockedUntil:
            nextFailures >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + LOCK_DURATION_MS)
              : null,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          message: "Invalid administrator credentials.",
        },
        { status: 401 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        adminFailedLoginCount: 0,
        adminLockedUntil: null,
      },
    });

    const csrfToken = randomBytes(32).toString("base64url");

    const adminToken = signAdminAuthToken(
      user.id,
      csrfToken
    );

    const response = NextResponse.json(
      {
        ok: true,
        message: "Admin login successful.",
      },
      { status: 200 }
    );

    response.headers.set("Cache-Control", "no-store");

    response.cookies.set("manna_admin_token", adminToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: ADMIN_AUTH_MAX_AGE_SECONDS,
    });

    // This cookie is readable by the console UI only so it can send
    // the matching CSRF header for write-like internal console requests.
    response.cookies.set("manna_admin_csrf", csrfToken, {
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
  maxAge: 4 * 60 * 60,
});

    return response;
  } catch (error) {
    console.error("MANNA_ADMIN_LOGIN_ERROR", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Unable to sign in to the Backend Console.",
      },
      { status: 500 }
    );
  }
}