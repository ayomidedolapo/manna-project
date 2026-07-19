import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export type OAuthProvider = "google" | "apple";

export type OAuthStatePayload = {
  provider: OAuthProvider;
  state: string;
  nonce: string;
  codeVerifier: string;
  nextPath: string;
  createdAt: number;
};

const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getStateSecret() {
  const secret = process.env.OAUTH_COOKIE_SECRET ?? process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("OAUTH_COOKIE_SECRET or JWT_SECRET must be at least 32 characters.");
  }

  return secret;
}

function signStatePayload(encodedPayload: string) {
  return createHmac("sha256", getStateSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

function isOAuthStatePayload(value: unknown): value is OAuthStatePayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    (payload.provider === "google" || payload.provider === "apple") &&
    typeof payload.state === "string" &&
    payload.state.length >= 32 &&
    typeof payload.nonce === "string" &&
    payload.nonce.length >= 32 &&
    typeof payload.codeVerifier === "string" &&
    payload.codeVerifier.length >= 32 &&
    typeof payload.nextPath === "string" &&
    typeof payload.createdAt === "number"
  );
}

export function createRandomToken() {
  return randomBytes(32).toString("base64url");
}

export function sanitizeNextPath(value: string | null) {
  if (!value) return "/";

  try {
    const decoded = decodeURIComponent(value);

    if (!decoded.startsWith("/") || decoded.startsWith("//")) {
      return "/";
    }

    if (decoded.startsWith("/api/")) {
      return "/";
    }

    return decoded;
  } catch {
    return "/";
  }
}

export function getOAuthCookieName(provider: OAuthProvider) {
  return `manna_oauth_${provider}`;
}

export function sealOAuthState(payload: OAuthStatePayload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signStatePayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function unsealOAuthState(value: string, provider: OAuthProvider) {
  const [encodedPayload, signature] = value.split(".");

  if (!encodedPayload || !signature) return null;

  const expectedSignature = signStatePayload(encodedPayload);

  if (!safeEquals(signature, expectedSignature)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as unknown;

    if (!isOAuthStatePayload(parsed)) return null;
    if (parsed.provider !== provider) return null;

    const isExpired = Date.now() - parsed.createdAt > OAUTH_COOKIE_MAX_AGE_SECONDS * 1000;

    if (isExpired) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function setOAuthStateCookie(
  response: NextResponse,
  provider: OAuthProvider,
  sealedState: string
) {
  response.cookies.set(getOAuthCookieName(provider), sealedState, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearOAuthStateCookie(response: NextResponse, provider: OAuthProvider) {
  response.cookies.set(getOAuthCookieName(provider), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function readOAuthStateCookie(req: NextRequest, provider: OAuthProvider) {
  return req.cookies.get(getOAuthCookieName(provider))?.value ?? null;
}
