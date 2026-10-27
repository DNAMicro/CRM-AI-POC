import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as settings from "@/lib/settings";
import { resolveContactByPhone } from "@/lib/sms";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from = formData.get("From") as string;
    const body = formData.get("Body") as string;
    const messageSid = formData.get("MessageSid") as string;
    const to = formData.get("To") as string;

    if (!from || !body) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    // Optionally verify Twilio signature
    const authToken = settings.getSecureSetting("twilio_auth_token");
    const twilioSignature = request.headers.get("x-twilio-signature");
    if (authToken && twilioSignature) {
      // Note: Full webhook verification requires the full URL which is tricky with localhost
      // For production, uncomment and use verifyTwilioWebhook
    }

    // Resolve contact by phone number
    const contactId = resolveContactByPhone(from);

    // Store the message
    db.insertSmsMessage({
      providerMessageId: messageSid || null,
      contactId,
      direction: "inbound",
      fromNumber: from,
      toNumber: to || settings.getSetting("twilio_phone_number") || "",
      body,
      status: "received",
      sentAt: new Date().toISOString(),
    });

    // Log activity if contact found
    if (contactId) {
      db.insertActivity({
        type: "sms",
        contactId,
        description: `Received SMS: ${body.slice(0, 80)}${body.length > 80 ? "..." : ""}`,
      });
    }

    // Return TwiML empty response
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  } catch (err) {
    console.error("SMS webhook error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
