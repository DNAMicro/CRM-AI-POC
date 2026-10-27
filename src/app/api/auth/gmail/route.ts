import { NextResponse } from "next/server";
import { getAuthUrl, isGmailConfigured, disconnectGmail } from "@/lib/gmail";

export async function GET() {
  if (!isGmailConfigured()) {
    return NextResponse.json(
      {
        error:
          "Gmail not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local",
      },
      { status: 400 }
    );
  }

  const url = getAuthUrl();
  return NextResponse.redirect(url);
}

export async function DELETE() {
  disconnectGmail();
  return NextResponse.json({ success: true });
}
