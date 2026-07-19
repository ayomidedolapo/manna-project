import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({
    ok: true,
    message: "Admin session ended.",
  });

  response.headers.set("Cache-Control", "no-store");

  response.cookies.set("manna_admin_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

 response.cookies.set("manna_admin_csrf", "", {
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
  maxAge: 0,
  expires: new Date(0),
});

  return response;
}