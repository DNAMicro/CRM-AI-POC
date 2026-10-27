import * as db from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "@/config/gmail";
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from "@/config/office365";

export function getSetting(key: string): string | undefined {
  return db.getSetting(key);
}

export function setSetting(key: string, value: string): void {
  db.setSetting(key, value);
}

export function getSecureSetting(key: string): string | undefined {
  const encrypted = db.getSetting(key);
  if (!encrypted) return undefined;
  try {
    return decrypt(encrypted);
  } catch {
    return undefined;
  }
}

export function setSecureSetting(key: string, value: string): void {
  db.setSetting(key, encrypt(value));
}

export function deleteSetting(key: string): void {
  db.deleteSetting(key);
}

export function getIntegrationStatus(): {
  gmail: { configured: boolean; connected: boolean; email?: string };
  sms: { configured: boolean; phoneNumber?: string };
  office365: { configured: boolean; connected: boolean; email?: string };
} {
  const gmailClientId = GOOGLE_CLIENT_ID;
  const gmailClientSecret = GOOGLE_CLIENT_SECRET;
  const gmailAccessToken = db.getSetting("gmail_access_token");
  const gmailEmail = db.getSetting("gmail_email");
  const twilioSid = db.getSetting("twilio_account_sid");
  const twilioPhone = db.getSetting("twilio_phone_number");
  const o365AccessToken = db.getSetting("o365_access_token");
  const o365Email = db.getSetting("o365_email");

  return {
    gmail: {
      configured: Boolean(gmailClientId && gmailClientSecret),
      connected: Boolean(gmailAccessToken),
      email: gmailEmail || undefined,
    },
    sms: {
      configured: Boolean(twilioSid),
      phoneNumber: twilioPhone || undefined,
    },
    office365: {
      configured: Boolean(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET),
      connected: Boolean(o365AccessToken),
      email: o365Email || undefined,
    },
  };
}
