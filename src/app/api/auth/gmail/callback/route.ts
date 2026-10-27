import { NextRequest, NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/gmail";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL("/settings?error=gmail_auth_denied", request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?error=gmail_no_code", request.url)
    );
  }

  try {
    await handleOAuthCallback(code);
    return NextResponse.redirect(
      new URL("/settings?gmailConnected=true", request.url)
    );
  } catch (err) {
    console.error("Gmail OAuth error:", err);
    return NextResponse.redirect(
      new URL("/settings?error=gmail_auth_failed", request.url)
    );
  }
}
