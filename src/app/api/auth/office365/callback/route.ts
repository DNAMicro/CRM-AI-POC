import { NextRequest, NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/office365";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL("/settings?error=o365_auth_denied", request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?error=o365_no_code", request.url)
    );
  }

  try {
    await handleOAuthCallback(code);
    return NextResponse.redirect(
      new URL("/settings?o365Connected=true", request.url)
    );
  } catch (err) {
    console.error("Office 365 OAuth error:", err);
    return NextResponse.redirect(
      new URL("/settings?error=o365_auth_failed", request.url)
    );
  }
}
