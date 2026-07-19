import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";

/*
  ============================================================
  CUSTOMER AUTHENTICATION
  ============================================================
  This is the existing customer authentication system.

  - Uses JWT_SECRET
  - Creates/verifies manna_token
  - Must remain separate from admin authentication
*/

const JWT_SECRET = process.env.JWT_SECRET!;
const TOKEN_EXPIRY = "7d";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set");
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function signAuthToken(userId: string, role: UserRole): string {
  return jwt.sign(
    { sub: userId, role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function verifyAuthToken(
  token: string
): { userId: string; role: UserRole } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & {
      role: UserRole;
    };

    if (typeof decoded.sub !== "string" || !decoded.role) {
      return null;
    }

    return {
      userId: decoded.sub,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}

/*
  ============================================================
  ADMIN AUTHENTICATION
  ============================================================
  This is reserved for Manna internal admin systems:

  - Backend Console
  - Future admin dashboard
  - Internal operations tools
  - Protected admin-only API routes

  It does NOT use JWT_SECRET.
  It does NOT affect manna_token or customer login.
*/

const ADMIN_TOKEN_EXPIRY = "4h";

export const ADMIN_AUTH_MAX_AGE_SECONDS = 4 * 60 * 60;

const ADMIN_TOKEN_SCOPE = "MANNA_ADMIN_ACCESS";
const ADMIN_TOKEN_ISSUER = "manna";
const ADMIN_TOKEN_AUDIENCE = "manna-admin";

export type AdminAuthSession = {
  userId: string;
  role: "ADMIN";
  csrfToken: string;
};

function getAdminJwtSecret(): string {
  const secret = process.env.MANNA_ADMIN_JWT_SECRET;

  if (!secret) {
    throw new Error("MANNA_ADMIN_JWT_SECRET is not set");
  }

  return secret;
}

export function signAdminAuthToken(
  userId: string,
  csrfToken: string
): string {
  if (csrfToken.length < 32) {
    throw new Error("Admin CSRF token is invalid");
  }

  return jwt.sign(
    {
      sub: userId,
      role: "ADMIN",
      scope: ADMIN_TOKEN_SCOPE,
      csrf: csrfToken,
    },
    getAdminJwtSecret(),
    {
      expiresIn: ADMIN_TOKEN_EXPIRY,
      issuer: ADMIN_TOKEN_ISSUER,
      audience: ADMIN_TOKEN_AUDIENCE,
    }
  );
}

export function verifyAdminAuthToken(
  token: string
): AdminAuthSession | null {
  try {
    const decoded = jwt.verify(token, getAdminJwtSecret(), {
      issuer: ADMIN_TOKEN_ISSUER,
      audience: ADMIN_TOKEN_AUDIENCE,
    }) as jwt.JwtPayload & {
      role?: unknown;
      scope?: unknown;
      csrf?: unknown;
    };

    if (
      typeof decoded.sub !== "string" ||
      decoded.role !== "ADMIN" ||
      decoded.scope !== ADMIN_TOKEN_SCOPE ||
      typeof decoded.csrf !== "string" ||
      decoded.csrf.length < 32
    ) {
      return null;
    }

    return {
      userId: decoded.sub,
      role: "ADMIN",
      csrfToken: decoded.csrf,
    };
  } catch {
    return null;
  }
}