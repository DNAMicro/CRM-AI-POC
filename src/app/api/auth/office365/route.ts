import { NextResponse } from "next/server";
import { getAuthUrl, isOffice365Configured, disconnectOffice365 } from "@/lib/office365";

export async function GET() {
  if (!isOffice365Configured()) {
    return NextResponse.json(
      { error: "Office 365 not configured. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to .env.local" },
      { status: 400 }
    );
  }

  const url = getAuthUrl();
  return NextResponse.redirect(url);
}

export async function DELETE() {
  disconnectOffice365();
  return NextResponse.json({ success: true });
}
