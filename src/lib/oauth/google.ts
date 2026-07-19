import { createRemoteJWKSet, jwtVerify } from "jose";
import type { GoogleOAuthConfig } from "@/lib/oauth/config";
import type { VerifiedOAuthProfile } from "@/lib/oauth/customer";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function buildGoogleAuthorizationUrl(input: {
  config: GoogleOAuthConfig;
  state: string;
  nonce: string;
  codeChallenge: string;
}) {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);

  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");

  return url;
}

async function exchangeGoogleCode(input: {
  config: GoogleOAuthConfig;
  code: string;
  codeVerifier: string;
}) {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    redirect_uri: input.config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error("Google OAuth token exchange failed.");
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Google OAuth token response is invalid.");
  }

  const tokenResponse = payload as Record<string, unknown>;

  if (typeof tokenResponse.id_token !== "string") {
    throw new Error("Google OAuth token response did not include an ID token.");
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

export async function verifyGoogleOAuthCallback(input: {
  config: GoogleOAuthConfig;
  code: string;
  codeVerifier: string;
  nonce: string;
}): Promise<VerifiedOAuthProfile> {
  const idToken = await exchangeGoogleCode(input);

  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    audience: input.config.clientId,
  });

  const claims = payload as Record<string, unknown>;

  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    throw new Error("Google OAuth issuer is invalid.");
  }

  if (claims.nonce !== input.nonce) {
    throw new Error("Google OAuth nonce is invalid.");
  }

  const subject = readStringClaim(claims, "sub");
  const email = readStringClaim(claims, "email");
  const emailVerified = readBooleanClaim(claims, "email_verified");
  const name = readStringClaim(claims, "name");

  if (!subject || !email) {
    throw new Error("Google OAuth profile is missing required identity claims.");
  }

  return {
    provider: "google",
    providerAccountId: subject,
    email,
    emailVerified,
    name,
  };
}
