import { NextRequest, NextResponse } from "next/server";
import { fetchThread, isGmailConnected, markAsRead } from "@/lib/gmail";
import * as db from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  if (!isGmailConnected()) {
    return NextResponse.json(
      { error: "Gmail not connected" },
      { status: 400 }
    );
  }

  const { threadId } = await params;

  try {
    // First check local cache
    let emails = db.getEmailThread(threadId);

    // If not cached, fetch from Gmail
    if (emails.length === 0) {
      emails = await fetchThread(threadId);
    }

    // Mark all unread as read
    for (const email of emails) {
      if (!email.isRead) {
        try {
          await markAsRead(email.gmailMessageId);
        } catch {
          // Non-critical — continue even if marking read fails
        }
      }
    }

    return NextResponse.json({ emails });
  } catch (err) {
    console.error("Fetch thread error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch thread",
      },
      { status: 500 }
    );
  }
}
