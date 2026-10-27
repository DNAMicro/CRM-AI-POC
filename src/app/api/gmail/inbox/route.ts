import { NextRequest, NextResponse } from "next/server";
import { isGmailConnected, syncRecentEmails } from "@/lib/gmail";
import * as db from "@/lib/db";
import * as settings from "@/lib/settings";

export async function GET(request: NextRequest) {
  if (!isGmailConnected()) {
    return NextResponse.json(
      { error: "Gmail not connected" },
      { status: 400 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("pageSize")) || 15;
  const contactId = searchParams.get("contactId") || undefined;
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  // Sync if last sync was more than 5 minutes ago
  const lastSync = settings.getSetting("gmail_last_sync");
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  if (!lastSync || new Date(lastSync).getTime() < fiveMinAgo) {
    try {
      await syncRecentEmails();
    } catch (err) {
      console.error("Gmail sync error:", err);
    }
  }

  const result = db.getEmails({ contactId, unreadOnly, page, pageSize });

  return NextResponse.json({
    ...result,
    page,
    pageSize,
    hasMore: page * pageSize < result.totalCount,
  });
}
