import { NextResponse, type NextRequest } from "next/server";
import { getGoogleOAuthConfig } from "@/lib/oauth/config";
import { signInOAuthCustomer } from "@/lib/oauth/customer";
import { verifyGoogleOAuthCallback } from "@/lib/oauth/google";
import {
  clearOAuthStateCookie,
  readOAuthStateCookie,
  unsealOAuthState,
} from "@/lib/oauth/state";

export const runtime = "nodejs";

function redirectWithError(req: NextRequest, message: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("oauth_error", message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const returnedState = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    const response = redirectWithError(req, "google_denied");
    clearOAuthStateCookie(response, "google");
    return response;
  }

  try {
    const sealedState = readOAuthStateCookie(req, "google");
    const state = sealedState ? unsealOAuthState(sealedState, "google") : null;

    if (!code || !returnedState || !state || state.state !== returnedState) {
      const response = redirectWithError(req, "invalid_google_state");
      clearOAuthStateCookie(response, "google");
      return response;
    }

    const profile = await verifyGoogleOAuthCallback({
      config: getGoogleOAuthConfig(req),
      code,
      codeVerifier: state.codeVerifier,
      nonce: state.nonce,
    });

    const result = await signInOAuthCustomer(profile);
    const response = NextResponse.redirect(new URL(state.nextPath, req.url));

    response.cookies.set("manna_token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    clearOAuthStateCookie(response, "google");

    return response;
  } catch (error: unknown) {
    console.error("GOOGLE_OAUTH_CALLBACK_ERROR", error);

    const response = redirectWithError(req, "google_failed");
    clearOAuthStateCookie(response, "google");
    return response;
  }
}
