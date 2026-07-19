import { NextResponse, type NextRequest } from "next/server";
import { getAppleOAuthConfig } from "@/lib/oauth/config";
import { parseApplePostedName, verifyAppleOAuthCallback } from "@/lib/oauth/apple";
import { signInOAuthCustomer } from "@/lib/oauth/customer";
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

async function readAppleCallbackForm(req: NextRequest) {
  const form = await req.formData();

  return {
    code: typeof form.get("code") === "string" ? String(form.get("code")) : null,
    state: typeof form.get("state") === "string" ? String(form.get("state")) : null,
    error: typeof form.get("error") === "string" ? String(form.get("error")) : null,
    user: typeof form.get("user") === "string" ? String(form.get("user")) : null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const form = await readAppleCallbackForm(req);

    if (form.error) {
      const response = redirectWithError(req, "apple_denied");
      clearOAuthStateCookie(response, "apple");
      return response;
    }

    const sealedState = readOAuthStateCookie(req, "apple");
    const state = sealedState ? unsealOAuthState(sealedState, "apple") : null;

    if (!form.code || !form.state || !state || state.state !== form.state) {
      const response = redirectWithError(req, "invalid_apple_state");
      clearOAuthStateCookie(response, "apple");
      return response;
    }

    const profile = await verifyAppleOAuthCallback({
      config: getAppleOAuthConfig(req),
      code: form.code,
      codeVerifier: state.codeVerifier,
      nonce: state.nonce,
      postedName: parseApplePostedName(form.user),
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

    clearOAuthStateCookie(response, "apple");

    return response;
  } catch (error: unknown) {
    console.error("APPLE_OAUTH_CALLBACK_ERROR", error);

    const response = redirectWithError(req, "apple_failed");
    clearOAuthStateCookie(response, "apple");
    return response;
  }
}
