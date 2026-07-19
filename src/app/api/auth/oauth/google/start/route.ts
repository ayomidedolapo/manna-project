import { NextResponse, type NextRequest } from "next/server";
import { getGoogleOAuthConfig } from "@/lib/oauth/config";
import { createPkceChallenge } from "@/lib/oauth/pkce";
import {
  createRandomToken,
  sanitizeNextPath,
  sealOAuthState,
  setOAuthStateCookie,
} from "@/lib/oauth/state";
import { buildGoogleAuthorizationUrl } from "@/lib/oauth/google";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const config = getGoogleOAuthConfig(req);
    const state = createRandomToken();
    const nonce = createRandomToken();
    const codeVerifier = createRandomToken();
    const nextPath = sanitizeNextPath(req.nextUrl.searchParams.get("next"));
    const codeChallenge = createPkceChallenge(codeVerifier);

    const sealedState = sealOAuthState({
      provider: "google",
      state,
      nonce,
      codeVerifier,
      nextPath,
      createdAt: Date.now(),
    });

    const authorizationUrl = buildGoogleAuthorizationUrl({
      config,
      state,
      nonce,
      codeChallenge,
    });

    const response = NextResponse.redirect(authorizationUrl);
    setOAuthStateCookie(response, "google", sealedState);

    return response;
  } catch (error: unknown) {
    console.error("GOOGLE_OAUTH_START_ERROR", error);

    return NextResponse.json(
      { message: "Unable to start Google sign-in." },
      { status: 500 }
    );
  }
}
