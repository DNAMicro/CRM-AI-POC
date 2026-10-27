import { NextResponse } from "next/server";
import { syncRecentEmails, isGmailConnected } from "@/lib/gmail";

export async function POST() {
  if (!isGmailConnected()) {
    return NextResponse.json(
      { error: "Gmail not connected" },
      { status: 400 }
    );
  }

  try {
    const result = await syncRecentEmails();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Sync error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Sync failed",
      },
      { status: 500 }
    );
  }
}
