import type { NextRequest } from "next/server";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type AppleOAuthConfig = {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  redirectUri: string;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

export function getAppBaseUrl(req: NextRequest) {
  const configuredBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();

  const baseUrl = configuredBaseUrl || req.nextUrl.origin;

  return baseUrl.replace(/\/$/, "");
}

export function getGoogleOAuthConfig(req: NextRequest): GoogleOAuthConfig {
  const baseUrl = getAppBaseUrl(req);

  return {
    clientId: requiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    redirectUri: `${baseUrl}/api/auth/oauth/google/callback`,
  };
}

export function getAppleOAuthConfig(req: NextRequest): AppleOAuthConfig {
  const baseUrl = getAppBaseUrl(req);

  return {
    clientId: requiredEnv("APPLE_OAUTH_CLIENT_ID"),
    teamId: requiredEnv("APPLE_OAUTH_TEAM_ID"),
    keyId: requiredEnv("APPLE_OAUTH_KEY_ID"),
    privateKey: requiredEnv("APPLE_OAUTH_PRIVATE_KEY").replace(/\\n/g, "\n"),
    redirectUri: `${baseUrl}/api/auth/oauth/apple/callback`,
  };
}
