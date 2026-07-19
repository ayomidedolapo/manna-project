import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import type { AppleOAuthConfig } from "@/lib/oauth/config";
import type { VerifiedOAuthProfile } from "@/lib/oauth/customer";

const APPLE_AUTHORIZATION_ENDPOINT = "https://appleid.apple.com/auth/authorize";
const APPLE_TOKEN_ENDPOINT = "https://appleid.apple.com/auth/token";
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export function buildAppleAuthorizationUrl(input: {
  config: AppleOAuthConfig;
  state: string;
  nonce: string;
  codeChallenge: string;
}) {
  const url = new URL(APPLE_AUTHORIZATION_ENDPOINT);

  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("scope", "name email");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url;
}

async function createAppleClientSecret(config: AppleOAuthConfig) {
  const key = await importPKCS8(config.privateKey, "ES256");

  return new SignJWT({})
    .setProtectedHeader({
      alg: "ES256",
      kid: config.keyId,
    })
    .setIssuer(config.teamId)
    .setIssuedAt()
    .setExpirationTime("180d")
    .setAudience("https://appleid.apple.com")
    .setSubject(config.clientId)
    .sign(key);
}

async function exchangeAppleCode(input: {
  config: AppleOAuthConfig;
  code: string;
  codeVerifier: string;
}) {
  const clientSecret = await createAppleClientSecret(input.config);

  const body = new URLSearchParams({
    code: input.code,
    client_id: input.config.clientId,
    client_secret: clientSecret,
    redirect_uri: input.config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  });

  const response = await fetch(APPLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error("Apple OAuth token exchange failed.");
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Apple OAuth token response is invalid.");
  }

  const tokenResponse = payload as Record<string, unknown>;

  if (typeof tokenResponse.id_token !== "string") {
    throw new Error("Apple OAuth token response did not include an ID token.");
  }

  return tokenResponse.id_token;
}

function readStringClaim(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBooleanClaim(payload: Record<string, unknown>, key: string) {
  const value = payload[key];

  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";

  return false;
}

export function parseApplePostedName(userJson: string | null) {
  if (!userJson) return null;

  try {
    const parsed = JSON.parse(userJson) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const user = parsed as Record<string, unknown>;
    const rawName = user.name;

    if (typeof rawName !== "object" || rawName === null || Array.isArray(rawName)) {
      return null;
    }

    const name = rawName as Record<string, unknown>;
    const firstName = typeof name.firstName === "string" ? name.firstName.trim() : "";
    const lastName = typeof name.lastName === "string" ? name.lastName.trim() : "";
    const fullName = `${firstName} ${lastName}`.trim();

    return fullName || null;
  } catch {
    return null;
  }
}

export async function verifyAppleOAuthCallback(input: {
  config: AppleOAuthConfig;
  code: string;
  codeVerifier: string;
  nonce: string;
  postedName: string | null;
}): Promise<VerifiedOAuthProfile> {
  const idToken = await exchangeAppleCode(input);

  const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
    audience: input.config.clientId,
    issuer: "https://appleid.apple.com",
  });

  const claims = payload as Record<string, unknown>;

  if (claims.nonce !== input.nonce) {
    throw new Error("Apple OAuth nonce is invalid.");
  }

  const subject = readStringClaim(claims, "sub");
  const email = readStringClaim(claims, "email");
  const emailVerified = readBooleanClaim(claims, "email_verified");

  if (!subject || !email) {
    throw new Error("Apple OAuth profile is missing required identity claims.");
  }

  return {
    provider: "apple",
    providerAccountId: subject,
    email,
    emailVerified,
    name: input.postedName,
  };
}
