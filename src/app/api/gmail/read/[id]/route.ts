import { NextRequest, NextResponse } from "next/server";
import { markAsRead, isGmailConnected } from "@/lib/gmail";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isGmailConnected()) {
    return NextResponse.json(
      { error: "Gmail not connected" },
      { status: 400 }
    );
  }

  const { id } = await params;

  try {
    await markAsRead(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Mark read error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to mark as read",
      },
      { status: 500 }
    );
  }
}
