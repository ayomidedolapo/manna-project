import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAdminAuthToken } from "@/lib/auth";

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|authorization|cookie|api[_-]?key|signature|private|otp|pin/i;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function getVerifiedConsoleAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("manna_admin_token")?.value;

  const session = token
    ? verifyAdminAuthToken(token)
    : null;

  if (!session) {
    return null;
  }

  const admin = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!admin || admin.role !== "ADMIN") {
    return null;
  }

  return {
    adminId: admin.id,
    csrfToken: session.csrfToken,
  };
}

export function isSameOriginRequest(req: Request): boolean {
  const origin = req.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    const expectedOrigin = new URL(req.url).origin;

    if (origin !== expectedOrigin) {
      return false;
    }
  } catch {
    return false;
  }

  const fetchSite = req.headers.get("sec-fetch-site");

  if (
    fetchSite &&
    fetchSite !== "same-origin" &&
    fetchSite !== "same-site"
  ) {
    return false;
  }

  return true;
}

export async function hasValidConsoleCsrf(
  req: Request,
  expectedCsrfToken: string
): Promise<boolean> {
  const sentToken = req.headers.get("x-manna-admin-csrf");

  if (!sentToken) {
    return false;
  }

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get("manna_admin_csrf")?.value;

  if (!cookieToken) {
    return false;
  }

  return (
    safeEqual(sentToken, cookieToken) &&
    safeEqual(sentToken, expectedCsrfToken)
  );
}

export function sanitizeForAudit(
  value: unknown,
  depth = 0
): unknown {
  if (depth > 6) {
    return "[TRUNCATED_DEPTH]";
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value.length > 2000
      ? `${value.slice(0, 2000)}…[TRUNCATED]`
      : value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => sanitizeForAudit(item, depth + 1));
  }

  if (typeof value === "object") {
    const safeObject: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>
    ).slice(0, 50)) {
      safeObject[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : sanitizeForAudit(item, depth + 1);
    }

    return safeObject;
  }

  return String(value);
}

export function toAuditJson(
  value: unknown
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  const safeValue = sanitizeForAudit(value);

  if (safeValue === null) {
    return "null";
  }

  return JSON.parse(
    JSON.stringify(safeValue)
  ) as Prisma.InputJsonValue;
}