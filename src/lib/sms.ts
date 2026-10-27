import * as db from "@/lib/db";
import * as settings from "@/lib/settings";

export function isSmsConfigured(): boolean {
  return Boolean(
    settings.getSetting("twilio_account_sid") &&
    settings.getSecureSetting("twilio_auth_token") &&
    settings.getSetting("twilio_phone_number")
  );
}

function getTwilioClient() {
  const accountSid = settings.getSetting("twilio_account_sid");
  const authToken = settings.getSecureSetting("twilio_auth_token");

  if (!accountSid || !authToken) {
    throw new Error("Twilio not configured. Please set up SMS in Settings.");
  }

  // Dynamic import to avoid issues when twilio isn't configured
  const twilio = require("twilio");
  return twilio(accountSid, authToken);
}

export async function sendSms(params: {
  to: string;
  body: string;
  contactId?: string;
}): Promise<db.SmsRow> {
  const client = getTwilioClient();
  const fromNumber = settings.getSetting("twilio_phone_number");

  if (!fromNumber) {
    throw new Error("Twilio phone number not configured");
  }

  const message = await client.messages.create({
    to: params.to,
    from: fromNumber,
    body: params.body,
  });

  // Store in local DB
  const smsRow = db.insertSmsMessage({
    providerMessageId: message.sid,
    contactId: params.contactId || null,
    direction: "outbound",
    fromNumber,
    toNumber: params.to,
    body: params.body,
    status: message.status || "sent",
    sentAt: new Date().toISOString(),
  });

  // Log activity if we have a contact
  if (params.contactId) {
    db.insertActivity({
      type: "sms",
      contactId: params.contactId,
      description: `Sent SMS: ${params.body.slice(0, 80)}${params.body.length > 80 ? "..." : ""}`,
    });
  }

  return smsRow;
}

export function verifyTwilioWebhook(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const twilio = require("twilio");
  return twilio.validateRequest(authToken, signature, url, params);
}

export function resolveContactByPhone(phone: string): string | null {
  const contacts = db.getAllContacts();
  // Normalize phone for comparison: strip non-digits
  const normalize = (p: string) => p.replace(/\D/g, "");
  const normalizedInput = normalize(phone);

  const contact = contacts.find(c => {
    if (!c.phone) return false;
    const normalizedContact = normalize(c.phone);
    // Match if the last 10 digits are the same (handles +1 prefix differences)
    return normalizedInput.slice(-10) === normalizedContact.slice(-10);
  });

  return contact?.id || null;
}
