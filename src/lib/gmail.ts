import { google, gmail_v1 } from "googleapis";
import * as db from "@/lib/db";
import * as settings from "@/lib/settings";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "@/config/gmail";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

const REDIRECT_URI = "http://localhost:5555/api/auth/gmail/callback";

// Mutex for token refresh to prevent concurrent refresh attempts
let refreshLock: Promise<void> | null = null;

function getOAuth2Client() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error(
      "Gmail not configured. Add your Google OAuth credentials to src/config/gmail.ts"
    );
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
}

export function isGmailConfigured(): boolean {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

export function isGmailConnected(): boolean {
  return Boolean(settings.getSecureSetting("gmail_access_token"));
}

export function getAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function handleOAuthCallback(
  code: string
): Promise<{ email: string }> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token) throw new Error("No access token received");

  // Store tokens
  settings.setSecureSetting("gmail_access_token", tokens.access_token);
  if (tokens.refresh_token) {
    settings.setSecureSetting("gmail_refresh_token", tokens.refresh_token);
  }
  if (tokens.expiry_date) {
    settings.setSetting("gmail_token_expiry", String(tokens.expiry_date));
  }

  // Get user email
  client.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth: client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress || "unknown";
  settings.setSetting("gmail_email", email);

  return { email };
}

export function disconnectGmail(): void {
  settings.deleteSetting("gmail_access_token");
  settings.deleteSetting("gmail_refresh_token");
  settings.deleteSetting("gmail_token_expiry");
  settings.deleteSetting("gmail_email");
}

async function getAuthenticatedClient(): Promise<gmail_v1.Gmail> {
  // Wait for any in-progress refresh
  if (refreshLock) await refreshLock;

  const client = getOAuth2Client();
  const accessToken = settings.getSecureSetting("gmail_access_token");
  const refreshToken = settings.getSecureSetting("gmail_refresh_token");
  const expiry = settings.getSetting("gmail_token_expiry");

  if (!accessToken)
    throw new Error("Gmail not connected. Please connect Gmail in Settings.");

  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
    expiry_date: expiry ? Number(expiry) : undefined,
  });

  // Check if token is expired or about to expire (within 5 min)
  const now = Date.now();
  if (expiry && Number(expiry) < now + 5 * 60 * 1000) {
    // Refresh token
    refreshLock = (async () => {
      try {
        const { credentials } = await client.refreshAccessToken();
        if (credentials.access_token) {
          settings.setSecureSetting(
            "gmail_access_token",
            credentials.access_token
          );
        }
        if (credentials.expiry_date) {
          settings.setSetting(
            "gmail_token_expiry",
            String(credentials.expiry_date)
          );
        }
        client.setCredentials(credentials);
      } catch (err) {
        // Only a revoked/expired grant warrants dropping credentials;
        // network blips and 5xx responses should leave them in place
        const oauthError = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
        if (oauthError === "invalid_grant") {
          disconnectGmail();
          throw new Error(
            "Gmail session expired. Please reconnect in Settings."
          );
        }
        throw new Error("Couldn't reach Gmail right now. Please try again shortly.");
      } finally {
        refreshLock = null;
      }
    })();
    await refreshLock;
  }

  return google.gmail({ version: "v1", auth: client });
}

// ===== Email Operations =====

function parseEmailHeaders(
  headers: gmail_v1.Schema$MessagePartHeader[]
): {
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  messageId: string;
} {
  const get = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ||
    "";
  return {
    from: get("from"),
    to: get("to"),
    cc: get("cc"),
    subject: get("subject"),
    date: get("date"),
    messageId: get("message-id"),
  };
}

function extractEmailBody(
  payload: gmail_v1.Schema$MessagePart
): { html: string; text: string } {
  let html = "";
  let text = "";

  if (payload.mimeType === "text/html" && payload.body?.data) {
    html = Buffer.from(payload.body.data, "base64url").toString("utf-8");
  } else if (payload.mimeType === "text/plain" && payload.body?.data) {
    text = Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  // Check parts recursively
  if (payload.parts) {
    for (const part of payload.parts) {
      const sub = extractEmailBody(part);
      if (sub.html) html = sub.html;
      if (sub.text) text = sub.text;
    }
  }

  return { html, text };
}

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

export async function sendEmail(params: {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  cc?: string;
  inReplyTo?: string;
  threadId?: string;
  contactId?: string;
}): Promise<db.EmailRow> {
  const gmail = await getAuthenticatedClient();
  const userEmail = settings.getSetting("gmail_email") || "me";

  // Build MIME message
  const boundary = `boundary_${Date.now()}`;
  const headers = [
    `From: ${userEmail}`,
    `To: ${params.to}`,
    ...(params.cc ? [`Cc: ${params.cc}`] : []),
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    ...(params.inReplyTo
      ? [
          `In-Reply-To: ${params.inReplyTo}`,
          `References: ${params.inReplyTo}`,
        ]
      : []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const mime = [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    params.bodyText,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    params.bodyHtml,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const encodedMessage = Buffer.from(mime).toString("base64url");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
      ...(params.threadId ? { threadId: params.threadId } : {}),
    },
  });

  const sentMessageId = result.data.id || "";
  const sentThreadId = result.data.threadId || params.threadId || "";

  // Store in local DB
  const contactId = params.contactId || resolveContactId(params.to);
  const emailRow = db.upsertEmail({
    gmailMessageId: sentMessageId,
    gmailThreadId: sentThreadId,
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
    source: "gmail",
    outlookMessageId: null,
    outlookConversationId: null,
  });

  // Log activity if we have a contact
  if (contactId) {
    db.insertActivity({
      type: "email",
      contactId,
      description: `Sent email: ${params.subject}`,
    });
  }

  return emailRow;
}

export async function fetchInbox(params?: {
  maxResults?: number;
  pageToken?: string;
  query?: string;
}): Promise<{ emails: db.EmailRow[]; nextPageToken?: string }> {
  const gmail = await getAuthenticatedClient();
  const maxResults = params?.maxResults || 20;
  const q = params?.query || "in:inbox";

  const listResult = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    q,
    pageToken: params?.pageToken || undefined,
  });

  const messageIds = listResult.data.messages || [];
  const emails: db.EmailRow[] = [];

  for (const msg of messageIds) {
    if (!msg.id) continue;

    // Check if already cached
    const existing = db.getEmailByGmailId(msg.id);
    if (existing) {
      emails.push(existing);
      continue;
    }

    // Fetch full message
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = parseEmailHeaders(full.data.payload?.headers || []);
    const body = extractEmailBody(full.data.payload || {});
    const isUnread = full.data.labelIds?.includes("UNREAD") || false;
    const userEmail = settings.getSetting("gmail_email") || "";
    const fromAddr = extractEmailAddress(headers.from);
    const direction =
      fromAddr.toLowerCase() === userEmail.toLowerCase()
        ? "outbound"
        : "inbound";
    const contactAddress =
      direction === "inbound" ? headers.from : headers.to;
    const contactId = resolveContactId(contactAddress);

    const emailRow = db.upsertEmail({
      gmailMessageId: msg.id,
      gmailThreadId: full.data.threadId || "",
      contactId,
      direction,
      fromAddress: headers.from,
      toAddress: headers.to,
      ccAddress: headers.cc,
      subject: headers.subject,
      bodyHtml: body.html,
      bodyText: body.text || body.html.replace(/<[^>]*>/g, ""),
      isRead: isUnread ? 0 : 1,
      labels: JSON.stringify(full.data.labelIds || []),
      sentAt: headers.date
        ? new Date(headers.date).toISOString()
        : new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      source: "gmail",
      outlookMessageId: null,
      outlookConversationId: null,
    });

    emails.push(emailRow);
  }

  return {
    emails,
    nextPageToken: listResult.data.nextPageToken || undefined,
  };
}

export async function fetchThread(
  threadId: string
): Promise<db.EmailRow[]> {
  const gmail = await getAuthenticatedClient();

  const threadResult = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const messages = threadResult.data.messages || [];
  const results: db.EmailRow[] = [];
  const userEmail = settings.getSetting("gmail_email") || "";

  for (const msg of messages) {
    if (!msg.id) continue;

    const headers = parseEmailHeaders(msg.payload?.headers || []);
    const body = extractEmailBody(msg.payload || {});
    const isUnread = msg.labelIds?.includes("UNREAD") || false;
    const fromAddr = extractEmailAddress(headers.from);
    const direction =
      fromAddr.toLowerCase() === userEmail.toLowerCase()
        ? "outbound"
        : "inbound";
    const contactAddress =
      direction === "inbound" ? headers.from : headers.to;
    const contactId = resolveContactId(contactAddress);

    const emailRow = db.upsertEmail({
      gmailMessageId: msg.id,
      gmailThreadId: threadId,
      contactId,
      direction,
      fromAddress: headers.from,
      toAddress: headers.to,
      ccAddress: headers.cc || "",
      subject: headers.subject,
      bodyHtml: body.html,
      bodyText: body.text || body.html.replace(/<[^>]*>/g, ""),
      isRead: isUnread ? 0 : 1,
      labels: JSON.stringify(msg.labelIds || []),
      sentAt: headers.date
        ? new Date(headers.date).toISOString()
        : new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      source: "gmail",
      outlookMessageId: null,
      outlookConversationId: null,
    });

    results.push(emailRow);
  }

  return results;
}

export async function syncRecentEmails(): Promise<{
  newCount: number;
  totalSynced: number;
}> {
  // Check if sync is already in progress
  const syncInProgress = settings.getSetting("gmail_sync_in_progress");
  if (syncInProgress === "true") {
    return { newCount: 0, totalSynced: 0 };
  }

  settings.setSetting("gmail_sync_in_progress", "true");
  try {
    const result = await fetchInbox({ maxResults: 30 });
    settings.setSetting("gmail_last_sync", new Date().toISOString());
    return { newCount: result.emails.length, totalSynced: result.emails.length };
  } finally {
    settings.setSetting("gmail_sync_in_progress", "false");
  }
}

export async function markAsRead(gmailMessageId: string): Promise<void> {
  const gmail = await getAuthenticatedClient();

  // Mark read in Gmail
  await gmail.users.messages.modify({
    userId: "me",
    id: gmailMessageId,
    requestBody: {
      removeLabelIds: ["UNREAD"],
    },
  });

  // Mark read locally
  const email = db.getEmailByGmailId(gmailMessageId);
  if (email) {
    db.markEmailRead(email.id);
  }
}
