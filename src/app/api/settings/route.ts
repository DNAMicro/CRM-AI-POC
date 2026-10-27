import { NextRequest, NextResponse } from "next/server";
import * as settings from "@/lib/settings";

export async function GET() {
  const status = settings.getIntegrationStatus();
  const emailSignature = settings.getSetting("email_signature");
  const userName = settings.getSetting("user_name");
  const userRole = settings.getSetting("user_role");

  return NextResponse.json({
    integrations: status,
    preferences: {
      emailSignature: emailSignature || "",
    },
    profile: {
      userName: userName || "",
      userRole: userRole || "",
    },
  });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle Twilio settings (these are sensitive)
    if (body.twilio_account_sid !== undefined) {
      if (body.twilio_account_sid) {
        settings.setSetting("twilio_account_sid", body.twilio_account_sid);
      } else {
        settings.deleteSetting("twilio_account_sid");
      }
    }
    if (body.twilio_auth_token !== undefined) {
      if (body.twilio_auth_token) {
        settings.setSecureSetting("twilio_auth_token", body.twilio_auth_token);
      } else {
        settings.deleteSetting("twilio_auth_token");
      }
    }
    if (body.twilio_phone_number !== undefined) {
      if (body.twilio_phone_number) {
        settings.setSetting("twilio_phone_number", body.twilio_phone_number);
      } else {
        settings.deleteSetting("twilio_phone_number");
      }
    }

    // Handle profile
    if (body.user_name !== undefined) {
      settings.setSetting("user_name", body.user_name);
    }
    if (body.user_role !== undefined) {
      settings.setSetting("user_role", body.user_role);
    }

    // Handle preferences
    if (body.email_signature !== undefined) {
      settings.setSetting("email_signature", body.email_signature);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
