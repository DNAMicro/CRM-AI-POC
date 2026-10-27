import { NextRequest, NextResponse } from "next/server";
import { sendSms, isSmsConfigured } from "@/lib/sms";

export async function POST(request: NextRequest) {
  if (!isSmsConfigured()) {
    return NextResponse.json(
      { error: "SMS not configured. Please set up Twilio in Settings." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { to, body: messageBody, contactId } = body;

    if (!to || !messageBody) {
      return NextResponse.json({ error: "Phone number and message body are required" }, { status: 400 });
    }

    const sms = await sendSms({ to, body: messageBody, contactId });
    return NextResponse.json(sms, { status: 201 });
  } catch (err) {
    console.error("SMS send error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send SMS" },
      { status: 500 }
    );
  }
}
