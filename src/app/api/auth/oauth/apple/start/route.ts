import { NextResponse, type NextRequest } from "next/server";
import { getAppleOAuthConfig } from "@/lib/oauth/config";
import { createPkceChallenge } from "@/lib/oauth/pkce";
import {
  createRandomToken,
  sanitizeNextPath,
  sealOAuthState,
  setOAuthStateCookie,
} from "@/lib/oauth/state";
import { buildAppleAuthorizationUrl } from "@/lib/oauth/apple";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const config = getAppleOAuthConfig(req);
    const state = createRandomToken();
    const nonce = createRandomToken();
    const codeVerifier = createRandomToken();
    const nextPath = sanitizeNextPath(req.nextUrl.searchParams.get("next"));
    const codeChallenge = createPkceChallenge(codeVerifier);

    const sealedState = sealOAuthState({
      provider: "apple",
      state,
      nonce,
      codeVerifier,
      nextPath,
      createdAt: Date.now(),
    });

    const authorizationUrl = buildAppleAuthorizationUrl({
      config,
      state,
      nonce,
      codeChallenge,
    });

    const response = NextResponse.redirect(authorizationUrl);
    setOAuthStateCookie(response, "apple", sealedState);

    return response;
  } catch (error: unknown) {
    console.error("APPLE_OAUTH_START_ERROR", error);

    return NextResponse.json(
      { message: "Unable to start Apple sign-in." },
      { status: 500 }
    );
  }
}
