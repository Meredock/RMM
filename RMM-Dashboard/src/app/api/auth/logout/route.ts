import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const response = NextResponse.json({ ok: true });
  const secureCookie = process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && req.url.startsWith("https://"));

  response.cookies.set(SESSION_COOKIE, "", {
    maxAge: 0,
    path: "/",
    secure: secureCookie,
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  });
  return response;
}
