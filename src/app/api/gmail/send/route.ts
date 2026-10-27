import { NextRequest, NextResponse } from "next/server";
import { sendEmail, isGmailConnected } from "@/lib/gmail";

export async function POST(request: NextRequest) {
  if (!isGmailConnected()) {
    return NextResponse.json(
      { error: "Gmail not connected. Please connect Gmail in Settings." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const {
      to,
      subject,
      bodyHtml,
      bodyText,
      cc,
      contactId,
      inReplyTo,
      threadId,
    } = body;

    if (!to || !subject) {
      return NextResponse.json(
        { error: "To and subject are required" },
        { status: 400 }
      );
    }

    const email = await sendEmail({
      to,
      subject,
      bodyHtml: bodyHtml || "",
      bodyText: bodyText || bodyHtml?.replace(/<[^>]*>/g, "") || "",
      cc,
      contactId,
      inReplyTo,
      threadId,
    });

    return NextResponse.json(email, { status: 201 });
  } catch (err) {
    console.error("Send email error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to send email",
      },
      { status: 500 }
    );
  }
}
