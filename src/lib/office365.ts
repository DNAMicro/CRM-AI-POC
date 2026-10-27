import * as db from "@/lib/db";
import * as settings from "@/lib/settings";
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID } from "@/config/office365";

const SCOPES = [
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
  "Contacts.Read",
  "User.Read",
  "offline_access",
];

const REDIRECT_URI = "http://localhost:5555/api/auth/office365/callback";
const AUTH_BASE = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0`;

let refreshLock: Promise<void> | null = null;

// ===== Configuration Checks =====

export function isOffice365Configured(): boolean {
  return Boolean(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET);
}

export function isOffice365Connected(): boolean {
  return Boolean(settings.getSecureSetting("o365_access_token"));
}

// ===== OAuth Flow =====

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(" "),
    response_mode: "query",
    prompt: "consent",
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

export async function handleOAuthCallback(code: string): Promise<{ email: string }> {
  const tokenRes = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
      scope: SCOPES.join(" "),
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const tokens = await tokenRes.json();
  if (!tokens.access_token) throw new Error("No access token received");

  settings.setSecureSetting("o365_access_token", tokens.access_token);
  if (tokens.refresh_token) {
    settings.setSecureSetting("o365_refresh_token", tokens.refresh_token);
  }
  if (tokens.expires_in) {
    const expiryDate = Date.now() + tokens.expires_in * 1000;
    settings.setSetting("o365_token_expiry", String(expiryDate));
  }

  const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileRes.json();
  const email = profile.mail || profile.userPrincipalName || "unknown";
  settings.setSetting("o365_email", email);

  return { email };
}

export function disconnectOffice365(): void {
  settings.deleteSetting("o365_access_token");
  settings.deleteSetting("o365_refresh_token");
  settings.deleteSetting("o365_token_expiry");
  settings.deleteSetting("o365_email");
}

// ===== Token Management =====

async function getAccessToken(): Promise<string> {
  if (refreshLock) await refreshLock;

  const accessToken = settings.getSecureSetting("o365_access_token");
  const refreshToken = settings.getSecureSetting("o365_refresh_token");
  const expiry = settings.getSetting("o365_token_expiry");

  if (!accessToken) {
    throw new Error("Office 365 not connected. Please connect in Settings.");
  }

  const now = Date.now();
  if (expiry && Number(expiry) < now + 5 * 60 * 1000) {
    if (!refreshToken) {
      disconnectOffice365();
      throw new Error("Office 365 session expired. Please reconnect in Settings.");
    }

    refreshLock = (async () => {
      try {
        const tokenRes = await fetch(`${AUTH_BASE}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            client_secret: MICROSOFT_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
            scope: SCOPES.join(" "),
          }),
        }).catch(() => {
          throw new Error("Couldn't reach Office 365 right now. Please try again shortly.");
        });

        if (!tokenRes.ok) {
          // Only a revoked/expired grant warrants dropping credentials;
          // transient 5xx responses should leave them in place
          const body = await tokenRes.json().catch(() => ({}));
          if (body.error === "invalid_grant") {
            disconnectOffice365();
            throw new Error("Office 365 session expired. Please reconnect in Settings.");
          }
          throw new Error("Couldn't reach Office 365 right now. Please try again shortly.");
        }

        const tokens = await tokenRes.json();
        if (tokens.access_token) {
          settings.setSecureSetting("o365_access_token", tokens.access_token);
        }
        if (tokens.refresh_token) {
          settings.setSecureSetting("o365_refresh_token", tokens.refresh_token);
        }
        if (tokens.expires_in) {
          settings.setSetting("o365_token_expiry", String(Date.now() + tokens.expires_in * 1000));
        }
      } finally {
        refreshLock = null;
      }
    })();
    await refreshLock;

    return settings.getSecureSetting("o365_access_token")!;
  }

  return accessToken;
}

async function graphFetch(path: string, options?: RequestInit, _retry = false): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  // On 401, force token refresh and retry once
  if (res.status === 401 && !_retry) {
    settings.setSetting("o365_token_expiry", "0"); // Force refresh on next getAccessToken call
    return graphFetch(path, options, true);
  }

  if (!res.ok) {
    if (res.status === 401) {
      disconnectOffice365();
      throw new Error("Office 365 session expired. Please reconnect in Settings.");
    }
    const body = await res.text();
    throw new Error(`Graph API error ${res.status}: ${body}`);
  }

  if (res.status === 204) return {};
  return res.json();
}

// ===== Helpers =====

function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1] : raw.trim();
}

function resolveContactId(emailAddress: string): string | null {
  const addr = extractEmailAddress(emailAddress).toLowerCase();
  const contacts = db.getAllContacts();
  const contact = contacts.find((c) => c.email.toLowerCase() === addr);
  return contact?.id || null;
}

// ===== Email Operations =====

export async function sendEmail(params: {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  cc?: string;
  conversationId?: string;
  contactId?: string;
}): Promise<db.EmailRow> {
  const userEmail = settings.getSetting("o365_email") || "me";

  const message: Record<string, unknown> = {
    subject: params.subject,
    body: { contentType: "HTML", content: params.bodyHtml },
    toRecipients: [{ emailAddress: { address: params.to } }],
  };

  if (params.cc) {
    message.ccRecipients = [{ emailAddress: { address: params.cc } }];
  }
  if (params.conversationId) {
    message.conversationId = params.conversationId;
  }

  await graphFetch("/me/sendMail", {
    method: "POST",
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  const contactId = params.contactId || resolveContactId(params.to);
  const emailRow = db.upsertOutlookEmail({
    outlookMessageId: `sent_${Date.now()}`,
    outlookConversationId: params.conversationId || null,
    contactId,
    direction: "outbound",
    fromAddress: userEmail,
    toAddress: params.to,
    ccAddress: params.cc || "",
    subject: params.subject,
    bodyHtml: params.bodyHtml,
    bodyText: params.bodyText,
    isRead: 1,
    labels: "[]",
    sentAt: new Date().toISOString(),
    syncedAt: new Date().toISOString(),
    source: "outlook",
  });

  if (contactId) {
    db.insertActivity({
      type: "email",
      contactId,
      description: `Sent Outlook email: ${params.subject}`,
    });
  }

  return emailRow;
}

export async function fetchInbox(params?: {
  maxResults?: number;
  query?: string;
}): Promise<{ emails: db.EmailRow[]; nextPageToken?: string }> {
  const maxResults = params?.maxResults || 20;
  const userEmail = settings.getSetting("o365_email") || "";

  let path = `/me/messages?$top=${maxResults}&$orderby=receivedDateTime desc&$select=id,conversationId,from,toRecipients,ccRecipients,subject,body,bodyPreview,isRead,receivedDateTime,webLink`;
  if (params?.query) {
    path += `&$search="${encodeURIComponent(params.query)}"`;
  }

  const data = await graphFetch(path) as { value: Array<Record<string, unknown>> };
  const messages = data.value || [];
  const emails: db.EmailRow[] = [];

  for (const msg of messages) {
    const msgId = msg.id as string;
    if (!msgId) continue;

    const existing = db.getEmailByOutlookId(msgId);
    if (existing) {
      emails.push(existing);
      continue;
    }

    const from = (msg.from as { emailAddress: { address: string; name?: string } })?.emailAddress;
    const toRecipients = (msg.toRecipients as Array<{ emailAddress: { address: string } }>) || [];
    const ccRecipients = (msg.ccRecipients as Array<{ emailAddress: { address: string } }>) || [];

    const fromAddress = from?.name ? `${from.name} <${from.address}>` : from?.address || "";
    const toAddress = toRecipients.map(r => r.emailAddress.address).join(", ");
    const ccAddress = ccRecipients.map(r => r.emailAddress.address).join(", ");

    const direction = from?.address?.toLowerCase() === userEmail.toLowerCase() ? "outbound" : "inbound";
    const contactAddress = direction === "inbound" ? (from?.address || "") : (toRecipients[0]?.emailAddress.address || "");
    const contactId = resolveContactId(contactAddress);

    const body = msg.body as { contentType: string; content: string } | undefined;
    const bodyHtml = body?.contentType === "html" ? (body.content || "") : "";
    const bodyText = body?.contentType === "text" ? (body.content || "") : (msg.bodyPreview as string || "");

    const emailRow = db.upsertOutlookEmail({
      outlookMessageId: msgId,
      outlookConversationId: (msg.conversationId as string) || null,
      contactId,
      direction,
      fromAddress,
      toAddress,
      ccAddress,
      subject: (msg.subject as string) || "",
      bodyHtml,
      bodyText: bodyText || bodyHtml.replace(/<[^>]*>/g, ""),
      isRead: (msg.isRead as boolean) ? 1 : 0,
      labels: "[]",
      sentAt: (msg.receivedDateTime as string) || new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      source: "outlook",
    });

    emails.push(emailRow);
  }

  return { emails };
}

export async function fetchThread(conversationId: string): Promise<db.EmailRow[]> {
  const userEmail = settings.getSetting("o365_email") || "";

  const data = await graphFetch(
    `/me/messages?$filter=conversationId eq '${conversationId}'&$orderby=receivedDateTime asc&$select=id,conversationId,from,toRecipients,ccRecipients,subject,body,isRead,receivedDateTime`
  ) as { value: Array<Record<string, unknown>> };

  const messages = data.value || [];
  const results: db.EmailRow[] = [];

  for (const msg of messages) {
    const msgId = msg.id as string;
    if (!msgId) continue;

    const from = (msg.from as { emailAddress: { address: string; name?: string } })?.emailAddress;
    const toRecipients = (msg.toRecipients as Array<{ emailAddress: { address: string } }>) || [];
    const ccRecipients = (msg.ccRecipients as Array<{ emailAddress: { address: string } }>) || [];

    const fromAddress = from?.name ? `${from.name} <${from.address}>` : from?.address || "";
    const toAddress = toRecipients.map(r => r.emailAddress.address).join(", ");
    const ccAddress = ccRecipients.map(r => r.emailAddress.address).join(", ");

    const direction = from?.address?.toLowerCase() === userEmail.toLowerCase() ? "outbound" : "inbound";
    const contactAddress = direction === "inbound" ? (from?.address || "") : (toRecipients[0]?.emailAddress.address || "");
    const contactId = resolveContactId(contactAddress);

    const body = msg.body as { contentType: string; content: string } | undefined;
    const bodyHtml = body?.contentType === "html" ? (body.content || "") : "";
    const bodyText = body?.contentType === "text" ? (body.content || "") : "";

    const emailRow = db.upsertOutlookEmail({
      outlookMessageId: msgId,
      outlookConversationId: conversationId,
      contactId,
      direction,
      fromAddress,
      toAddress,
      ccAddress,
      subject: (msg.subject as string) || "",
      bodyHtml,
      bodyText: bodyText || bodyHtml.replace(/<[^>]*>/g, ""),
      isRead: (msg.isRead as boolean) ? 1 : 0,
      labels: "[]",
      sentAt: (msg.receivedDateTime as string) || new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      source: "outlook",
    });

    results.push(emailRow);
  }

  return results;
}

export async function syncRecentEmails(): Promise<{ newCount: number; totalSynced: number }> {
  const syncInProgress = settings.getSetting("o365_sync_in_progress");
  if (syncInProgress === "true") {
    return { newCount: 0, totalSynced: 0 };
  }

  settings.setSetting("o365_sync_in_progress", "true");
  try {
    const result = await fetchInbox({ maxResults: 30 });
    settings.setSetting("o365_last_sync", new Date().toISOString());
    return { newCount: result.emails.length, totalSynced: result.emails.length };
  } finally {
    settings.setSetting("o365_sync_in_progress", "false");
  }
}

export async function markAsRead(outlookMessageId: string): Promise<void> {
  await graphFetch(`/me/messages/${outlookMessageId}`, {
    method: "PATCH",
    body: JSON.stringify({ isRead: true }),
  });

  const email = db.getEmailByOutlookId(outlookMessageId);
  if (email) {
    db.markEmailRead(email.id);
  }
}

// ===== Calendar Operations =====

export async function getCalendarEvents(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<db.CalendarEventRow[]> {
  const start = params?.startDate || new Date().toISOString();
  const end = params?.endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const data = await graphFetch(
    `/me/calendarview?startdatetime=${encodeURIComponent(start)}&enddatetime=${encodeURIComponent(end)}&$select=id,subject,bodyPreview,start,end,location,isAllDay,organizer,attendees,webLink&$orderby=start/dateTime&$top=50`
  ) as { value: Array<Record<string, unknown>> };

  const events = data.value || [];
  const results: db.CalendarEventRow[] = [];

  for (const evt of events) {
    const eventId = evt.id as string;
    if (!eventId) continue;

    const startObj = evt.start as { dateTime: string; timeZone: string };
    const endObj = evt.end as { dateTime: string; timeZone: string };
    const organizer = evt.organizer as { emailAddress: { address: string; name?: string } } | undefined;
    const attendees = (evt.attendees as Array<{ emailAddress: { address: string; name?: string }; status: { response: string } }>) || [];
    const location = evt.location as { displayName?: string } | undefined;

    let contactId: string | null = null;
    for (const att of attendees) {
      const cid = resolveContactId(att.emailAddress.address);
      if (cid) { contactId = cid; break; }
    }

    const row = db.upsertCalendarEvent({
      outlookEventId: eventId,
      subject: (evt.subject as string) || "",
      bodyPreview: (evt.bodyPreview as string) || "",
      startTime: startObj?.dateTime ? new Date(startObj.dateTime + "Z").toISOString() : new Date().toISOString(),
      endTime: endObj?.dateTime ? new Date(endObj.dateTime + "Z").toISOString() : new Date().toISOString(),
      location: location?.displayName || "",
      isAllDay: (evt.isAllDay as boolean) ? 1 : 0,
      organizerEmail: organizer?.emailAddress.address || "",
      organizerName: organizer?.emailAddress.name || "",
      attendees: JSON.stringify(attendees.map(a => ({
        email: a.emailAddress.address,
        name: a.emailAddress.name || "",
        response: a.status?.response || "none",
      }))),
      contactId,
      dealId: null,
      webLink: (evt.webLink as string) || "",
      syncedAt: new Date().toISOString(),
    });

    results.push(row);
  }

  return results;
}

export async function createCalendarEvent(params: {
  subject: string;
  startTime: string;
  endTime: string;
  location?: string;
  bodyHtml?: string;
  attendees?: string[];
}): Promise<db.CalendarEventRow> {
  const event: Record<string, unknown> = {
    subject: params.subject,
    start: { dateTime: params.startTime, timeZone: "UTC" },
    end: { dateTime: params.endTime, timeZone: "UTC" },
  };

  if (params.location) {
    event.location = { displayName: params.location };
  }
  if (params.bodyHtml) {
    event.body = { contentType: "HTML", content: params.bodyHtml };
  }
  if (params.attendees?.length) {
    event.attendees = params.attendees.map(email => ({
      emailAddress: { address: email },
      type: "required",
    }));
  }

  const result = await graphFetch("/me/events", {
    method: "POST",
    body: JSON.stringify(event),
  }) as Record<string, unknown>;

  const startObj = result.start as { dateTime: string };
  const endObj = result.end as { dateTime: string };

  let contactId: string | null = null;
  if (params.attendees?.length) {
    contactId = resolveContactId(params.attendees[0]);
  }

  const row = db.upsertCalendarEvent({
    outlookEventId: result.id as string,
    subject: params.subject,
    bodyPreview: params.bodyHtml?.replace(/<[^>]*>/g, "").slice(0, 200) || "",
    startTime: new Date(startObj.dateTime + "Z").toISOString(),
    endTime: new Date(endObj.dateTime + "Z").toISOString(),
    location: params.location || "",
    isAllDay: 0,
    organizerEmail: settings.getSetting("o365_email") || "",
    organizerName: "",
    attendees: JSON.stringify((params.attendees || []).map(e => ({ email: e, name: "", response: "none" }))),
    contactId,
    dealId: null,
    webLink: (result.webLink as string) || "",
    syncedAt: new Date().toISOString(),
  });

  if (contactId) {
    db.insertActivity({
      type: "meeting",
      contactId,
      description: `Scheduled meeting: ${params.subject}`,
    });
  }

  return row;
}

// ===== Contact Import =====

export async function importContacts(): Promise<{
  contacts: Array<{ firstName: string; lastName: string; email: string; phone: string; company: string; title: string; alreadyExists: boolean }>;
  totalFetched: number;
}> {
  const data = await graphFetch(
    "/me/contacts?$select=givenName,surname,emailAddresses,businessPhones,mobilePhone,companyName,jobTitle&$top=100"
  ) as { value: Array<Record<string, unknown>> };

  const o365Contacts = data.value || [];
  const existingContacts = db.getAllContacts();
  const existingEmails = new Set(existingContacts.map(c => c.email.toLowerCase()));

  const result = o365Contacts.map(c => {
    const emails = (c.emailAddresses as Array<{ address: string }>) || [];
    const email = emails[0]?.address || "";
    const phones = (c.businessPhones as string[]) || [];
    const phone = phones[0] || (c.mobilePhone as string) || "";

    return {
      firstName: (c.givenName as string) || "",
      lastName: (c.surname as string) || "",
      email,
      phone,
      company: (c.companyName as string) || "",
      title: (c.jobTitle as string) || "",
      alreadyExists: email ? existingEmails.has(email.toLowerCase()) : false,
    };
  }).filter(c => c.email);

  return { contacts: result, totalFetched: o365Contacts.length };
}
