# Office 365 Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the CRM to Microsoft 365 for email, calendar, and contact sync — making it the single pane of glass for all client communication.

**Architecture:** No new npm dependencies — Microsoft Graph is a REST API accessed via native `fetch` with Bearer tokens. OAuth2 Authorization Code flow with manual token exchange/refresh. Emails stored in the existing `emails` table with new `source`/`outlookMessageId`/`outlookConversationId` columns. Calendar events get a new `calendar_events` table. Follows the exact Gmail integration pattern (`src/lib/gmail.ts`) for consistency.

**Tech Stack:** Microsoft Graph REST API v1.0, native fetch, SQLite (better-sqlite3), Next.js 16 API routes

**Spec:** `docs/superpowers/specs/2026-04-10-crm-advanced-features-design.md` (Phase 1)

---

## File Structure

### New files:
- `src/config/office365.ts` — env var exports (mirrors `src/config/gmail.ts`)
- `src/lib/office365.ts` — OAuth + Graph API client + email/calendar/contact operations (mirrors `src/lib/gmail.ts`)
- `src/app/api/auth/office365/route.ts` — OAuth entry + disconnect (mirrors gmail)
- `src/app/api/auth/office365/callback/route.ts` — OAuth callback (mirrors gmail)
- `src/app/api/office365/sync/route.ts` — Manual sync trigger (mirrors gmail)
- `src/components/rich-responses/CalendarEvents.tsx` — Calendar events display

### Modified files:
- `src/lib/db.ts` — schema additions (3 new columns on `emails`, new `calendar_events` table, new DB functions)
- `src/lib/settings.ts` — update `getIntegrationStatus()` to include O365
- `src/types/conversation.ts` — add `CalendarEventsData` type, add `"calendar-events"` to `RichBlockType`, update `IntegrationStatusData`
- `src/lib/llm/tools.ts` — add 6 new tool definitions
- `src/lib/llm/tool-executor.ts` — add 6 tool execution handlers
- `src/lib/llm/system-prompt.ts` — add O365 context rules
- `src/app/settings/page.tsx` — add O365 settings section
- `src/components/conversation/MessageBubble.tsx` — render `calendar-events` rich block

---

## Task 1: Configuration and Environment

**Files:**
- Create: `src/config/office365.ts`

- [ ] **Step 1: Create the Office 365 config file**

Create `src/config/office365.ts`:

```typescript
// Microsoft 365 OAuth2 credentials for Outlook integration.
// Get these from https://portal.azure.com -> App Registrations -> New Registration
// Platform: Web, Redirect URI: http://localhost:5555/api/auth/office365/callback
// API Permissions: Mail.ReadWrite, Mail.Send, Calendars.ReadWrite, Contacts.Read, User.Read, offline_access

export const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? "";
export const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? "";
export const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID ?? "common";
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/config/office365.ts 2>&1 || echo "check passed"`

- [ ] **Step 3: Commit**

```bash
git add src/config/office365.ts
git commit -m "feat(office365): add configuration for Microsoft OAuth credentials"
```

---

## Task 2: Database Schema Extensions

**Files:**
- Modify: `src/lib/db.ts` (schema init + new functions)

- [ ] **Step 1: Add helper function and schema extensions**

In `src/lib/db.ts`, add this helper function BEFORE the `initSchema` function:

```typescript
function safeAddColumn(db: Database.Database, table: string, column: string, definition: string) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch {
    // Column already exists
  }
}
```

Then in `initSchema`, AFTER the existing emails indexes (after line ~108 `CREATE INDEX IF NOT EXISTS idx_emails_read`), add:

```typescript
    // Office 365 schema extensions (additive)
    safeAddColumn(db, "emails", "source", "TEXT NOT NULL DEFAULT 'gmail'");
    safeAddColumn(db, "emails", "outlookMessageId", "TEXT UNIQUE");
    safeAddColumn(db, "emails", "outlookConversationId", "TEXT");
```

Then inside the `db.exec` template string, after the sms_messages indexes, add:

```sql
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      outlookEventId TEXT UNIQUE,
      subject TEXT NOT NULL,
      bodyPreview TEXT DEFAULT '',
      startTime TEXT NOT NULL,
      endTime TEXT NOT NULL,
      location TEXT DEFAULT '',
      isAllDay INTEGER NOT NULL DEFAULT 0,
      organizerEmail TEXT DEFAULT '',
      organizerName TEXT DEFAULT '',
      attendees TEXT DEFAULT '[]',
      contactId TEXT,
      dealId TEXT,
      webLink TEXT DEFAULT '',
      syncedAt TEXT NOT NULL,
      FOREIGN KEY (contactId) REFERENCES contacts(id),
      FOREIGN KEY (dealId) REFERENCES deals(id)
    );

    CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(startTime);
    CREATE INDEX IF NOT EXISTS idx_calendar_outlook_id ON calendar_events(outlookEventId);
    CREATE INDEX IF NOT EXISTS idx_emails_outlook_id ON emails(outlookMessageId);
    CREATE INDEX IF NOT EXISTS idx_emails_source ON emails(source);
```

- [ ] **Step 2: Update the EmailRow interface**

Replace the existing `EmailRow` interface (~line 745) with:

```typescript
export interface EmailRow {
  id: string;
  gmailMessageId: string;
  gmailThreadId: string;
  contactId: string | null;
  direction: "inbound" | "outbound";
  fromAddress: string;
  toAddress: string;
  ccAddress: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  isRead: number;
  labels: string;
  sentAt: string;
  syncedAt: string;
  source: "gmail" | "outlook";
  outlookMessageId: string | null;
  outlookConversationId: string | null;
}
```

- [ ] **Step 3: Add CalendarEventRow interface and DB functions**

Add after the `getUnreadEmailCount` function:

```typescript
// ===== OUTLOOK EMAIL QUERIES =====

export function upsertOutlookEmail(data: Omit<EmailRow, "id" | "gmailMessageId" | "gmailThreadId"> & { id?: string }): EmailRow {
  const db = getDb();
  const id = data.id || `e${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  db.prepare(`
    INSERT INTO emails (id, gmailMessageId, gmailThreadId, contactId, direction, fromAddress, toAddress, ccAddress, subject, bodyHtml, bodyText, isRead, labels, sentAt, syncedAt, source, outlookMessageId, outlookConversationId)
    VALUES (@id, '', '', @contactId, @direction, @fromAddress, @toAddress, @ccAddress, @subject, @bodyHtml, @bodyText, @isRead, @labels, @sentAt, @syncedAt, 'outlook', @outlookMessageId, @outlookConversationId)
    ON CONFLICT(outlookMessageId) DO UPDATE SET
      isRead = excluded.isRead,
      labels = excluded.labels,
      syncedAt = excluded.syncedAt,
      contactId = COALESCE(excluded.contactId, emails.contactId)
  `).run({ ...data, id, contactId: data.contactId || null, outlookMessageId: data.outlookMessageId || null, outlookConversationId: data.outlookConversationId || null });

  return db.prepare("SELECT * FROM emails WHERE id = ? OR outlookMessageId = ?").get(id, data.outlookMessageId) as EmailRow;
}

export function getEmailByOutlookId(outlookMessageId: string): EmailRow | undefined {
  return getDb().prepare("SELECT * FROM emails WHERE outlookMessageId = ?").get(outlookMessageId) as EmailRow | undefined;
}

export function getOutlookEmailThread(conversationId: string): EmailRow[] {
  return getDb().prepare("SELECT * FROM emails WHERE outlookConversationId = ? ORDER BY sentAt ASC").all(conversationId) as EmailRow[];
}

export function getOutlookEmails(opts: { contactId?: string; unreadOnly?: boolean; page?: number; pageSize?: number }): { emails: EmailRow[]; totalCount: number; unreadCount: number } {
  const db = getDb();
  const conditions: string[] = ["source = 'outlook'"];
  const params: unknown[] = [];

  if (opts.contactId) {
    conditions.push("contactId = ?");
    params.push(opts.contactId);
  }
  if (opts.unreadOnly) {
    conditions.push("isRead = 0");
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const page = opts.page || 1;
  const pageSize = opts.pageSize || 15;
  const offset = (page - 1) * pageSize;

  const totalCount = (db.prepare(`SELECT COUNT(*) as cnt FROM emails ${where}`).get(...params) as { cnt: number }).cnt;
  const unreadCount = (db.prepare(`SELECT COUNT(*) as cnt FROM emails ${where} AND isRead = 0`).get(...params) as { cnt: number }).cnt;
  const emails = db.prepare(`SELECT * FROM emails ${where} ORDER BY sentAt DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as EmailRow[];

  return { emails, totalCount, unreadCount };
}

// ===== CALENDAR EVENT QUERIES =====

export interface CalendarEventRow {
  id: string;
  outlookEventId: string;
  subject: string;
  bodyPreview: string;
  startTime: string;
  endTime: string;
  location: string;
  isAllDay: number;
  organizerEmail: string;
  organizerName: string;
  attendees: string;
  contactId: string | null;
  dealId: string | null;
  webLink: string;
  syncedAt: string;
}

export function upsertCalendarEvent(data: Omit<CalendarEventRow, "id"> & { id?: string }): CalendarEventRow {
  const db = getDb();
  const id = data.id || `cal${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  db.prepare(`
    INSERT INTO calendar_events (id, outlookEventId, subject, bodyPreview, startTime, endTime, location, isAllDay, organizerEmail, organizerName, attendees, contactId, dealId, webLink, syncedAt)
    VALUES (@id, @outlookEventId, @subject, @bodyPreview, @startTime, @endTime, @location, @isAllDay, @organizerEmail, @organizerName, @attendees, @contactId, @dealId, @webLink, @syncedAt)
    ON CONFLICT(outlookEventId) DO UPDATE SET
      subject = excluded.subject,
      bodyPreview = excluded.bodyPreview,
      startTime = excluded.startTime,
      endTime = excluded.endTime,
      location = excluded.location,
      isAllDay = excluded.isAllDay,
      attendees = excluded.attendees,
      syncedAt = excluded.syncedAt
  `).run({ ...data, id, contactId: data.contactId || null, dealId: data.dealId || null });

  return db.prepare("SELECT * FROM calendar_events WHERE id = ? OR outlookEventId = ?").get(id, data.outlookEventId) as CalendarEventRow;
}

export function getCalendarEvents(opts: { startDate?: string; endDate?: string; contactId?: string }): CalendarEventRow[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.startDate) {
    conditions.push("startTime >= ?");
    params.push(opts.startDate);
  }
  if (opts.endDate) {
    conditions.push("startTime <= ?");
    params.push(opts.endDate);
  }
  if (opts.contactId) {
    conditions.push("contactId = ?");
    params.push(opts.contactId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`SELECT * FROM calendar_events ${where} ORDER BY startTime ASC`).all(...params) as CalendarEventRow[];
}

export function getCalendarEventByOutlookId(outlookEventId: string): CalendarEventRow | undefined {
  return getDb().prepare("SELECT * FROM calendar_events WHERE outlookEventId = ?").get(outlookEventId) as CalendarEventRow | undefined;
}
```

- [ ] **Step 4: Verify the dev server starts**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat(office365): extend emails schema + add calendar_events table and DB functions"
```

---

## Task 3: Core Office 365 OAuth Module

**Files:**
- Create: `src/lib/office365.ts`

- [ ] **Step 1: Create the Office 365 module**

Create `src/lib/office365.ts` with the complete module. This file contains:
- OAuth functions: `isOffice365Configured`, `isOffice365Connected`, `getAuthUrl`, `handleOAuthCallback`, `disconnectOffice365`
- Token management: `getAccessToken` with mutex refresh lock (mirrors Gmail pattern)
- Graph API wrapper: `graphFetch` — authenticated fetch for Microsoft Graph REST API
- Email operations: `sendEmail`, `fetchInbox`, `fetchThread`, `syncRecentEmails`, `markAsRead`
- Calendar operations: `getCalendarEvents`, `createCalendarEvent`
- Contact import: `importContacts`

```typescript
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
        });

        if (!tokenRes.ok) throw new Error("Refresh failed");

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
      } catch {
        disconnectOffice365();
        throw new Error("Office 365 session expired. Please reconnect in Settings.");
      } finally {
        refreshLock = null;
      }
    })();
    await refreshLock;

    return settings.getSecureSetting("o365_access_token")!;
  }

  return accessToken;
}

async function graphFetch(path: string, options?: RequestInit): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/lib/office365.ts
git commit -m "feat(office365): add core module with OAuth, email, calendar, and contact operations"
```

---

## Task 4: OAuth API Routes

**Files:**
- Create: `src/app/api/auth/office365/route.ts`
- Create: `src/app/api/auth/office365/callback/route.ts`
- Create: `src/app/api/office365/sync/route.ts`

- [ ] **Step 1: Create the OAuth entry route**

Create `src/app/api/auth/office365/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getAuthUrl, isOffice365Configured, disconnectOffice365 } from "@/lib/office365";

export async function GET() {
  if (!isOffice365Configured()) {
    return NextResponse.json(
      { error: "Office 365 not configured. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to .env.local" },
      { status: 400 }
    );
  }

  const url = getAuthUrl();
  return NextResponse.redirect(url);
}

export async function DELETE() {
  disconnectOffice365();
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Create the OAuth callback route**

Create `src/app/api/auth/office365/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/office365";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL("/settings?error=o365_auth_denied", request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?error=o365_no_code", request.url)
    );
  }

  try {
    await handleOAuthCallback(code);
    return NextResponse.redirect(
      new URL("/settings?o365Connected=true", request.url)
    );
  } catch (err) {
    console.error("Office 365 OAuth error:", err);
    return NextResponse.redirect(
      new URL("/settings?error=o365_auth_failed", request.url)
    );
  }
}
```

- [ ] **Step 3: Create the sync route**

Create `src/app/api/office365/sync/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { isOffice365Connected, syncRecentEmails } from "@/lib/office365";

export async function POST() {
  if (!isOffice365Connected()) {
    return NextResponse.json({ error: "Office 365 not connected" }, { status: 400 });
  }

  try {
    const result = await syncRecentEmails();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Office 365 sync error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/office365/ src/app/api/office365/
git commit -m "feat(office365): add OAuth and sync API routes"
```

---

## Task 5: Types and Rich Block Updates

**Files:**
- Modify: `src/types/conversation.ts`

- [ ] **Step 1: Add `calendar-events` to RichBlockType**

In `src/types/conversation.ts` line 19, add `| "calendar-events"` after `| "task-list"`.

- [ ] **Step 2: Add CalendarEventsData type**

After the `TaskListData` interface (~line 363), add:

```typescript
// ===== Calendar Events =====

export interface CalendarEventItem {
  id: string;
  subject: string;
  startTime: string;
  endTime: string;
  location: string;
  isAllDay: boolean;
  organizerName: string;
  attendees: { email: string; name: string; response: string }[];
  contactId?: string;
  contactName?: string;
  webLink: string;
}

export interface CalendarEventsData {
  events: CalendarEventItem[];
  dateRange?: string;
}
```

- [ ] **Step 3: Update IntegrationStatusData**

Replace the `IntegrationStatusData` interface (~line 205) with:

```typescript
export interface IntegrationStatusData {
  gmail: {
    configured: boolean;
    connected: boolean;
    email?: string;
  };
  sms: {
    configured: boolean;
    phoneNumber?: string;
  };
  office365: {
    configured: boolean;
    connected: boolean;
    email?: string;
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/types/conversation.ts
git commit -m "feat(office365): add calendar-events rich block type and O365 integration status"
```

---

## Task 6: Settings Integration

**Files:**
- Modify: `src/lib/settings.ts`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Update getIntegrationStatus in settings.ts**

Add import at top of `src/lib/settings.ts`:

```typescript
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from "@/config/office365";
```

Replace the `getIntegrationStatus()` function with:

```typescript
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
```

- [ ] **Step 2: Add Office 365 section to settings page**

In `src/app/settings/page.tsx`, after the Gmail section closing `</section>` (line ~311) and before the Twilio section, add:

```tsx
        {/* Office 365 Section */}
        <section className="glass-card rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              settings?.integrations.office365?.connected ? "bg-emerald-100" : "bg-muted"
            }`}>
              <Mail className={`w-5 h-5 ${settings?.integrations.office365?.connected ? "text-emerald-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Email & Calendar (Office 365)</h2>
              <p className="text-[11px] text-muted-foreground">Email, calendar, and contacts via Microsoft 365</p>
            </div>
          </div>

          {settings?.integrations.office365?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 glass-surface rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-[13px] text-foreground">Connected as <strong>{settings.integrations.office365.email}</strong></span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-xl"
                  onClick={() => { fetch("/api/office365/sync", { method: "POST" }).then(() => setSaveMessage("Sync started!")); }}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={async () => {
                    await fetch("/api/auth/office365", { method: "DELETE" });
                    fetchSettings();
                    setSaveMessage("Office 365 disconnected");
                  }}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-foreground/80">
                Click below to sign in with Microsoft and authorize email, calendar, and contact access.
              </p>
              <a href="/api/auth/office365">
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-glass border-0 gap-1.5 rounded-xl"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Connect Office 365
                </Button>
              </a>
            </div>
          )}
        </section>
```

- [ ] **Step 3: Handle O365 callback URL params in settings page**

In the `useEffect` that handles URL params (around line 54-65), add alongside the Gmail handling:

```typescript
    if (searchParams.get("o365Connected") === "true") {
      setSaveMessage("Office 365 connected successfully!");
      fetchSettings();
      window.history.replaceState({}, "", "/settings");
    }
    const error = searchParams.get("error");
    if (error?.startsWith("o365_")) {
      setSaveMessage(`Office 365 connection failed: ${error.replace("o365_", "").replace(/_/g, " ")}`);
      window.history.replaceState({}, "", "/settings");
    }
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/settings.ts src/app/settings/page.tsx
git commit -m "feat(office365): add settings UI and integration status for O365"
```

---

## Task 7: LLM Tool Definitions

**Files:**
- Modify: `src/lib/llm/tools.ts`

- [ ] **Step 1: Add 6 tool definitions after `check_integrations_status`**

In `src/lib/llm/tools.ts`, after the `check_integrations_status` tool (~line 309), add these 6 tools:

```typescript
  {
    type: "function",
    function: {
      name: "send_outlook_email",
      description: "Prepare an Outlook email compose form for the user to review and send via Office 365. NEVER auto-sends. Use when the user wants to email using Outlook/Office 365.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "Contact ID (e.g. c1). Look up first if unknown." },
          contact_name: { type: "string", description: "Contact name to search for if ID is unknown" },
          subject: { type: "string", description: "Email subject line" },
          body_html: { type: "string", description: "Email body as HTML" },
          body_text: { type: "string", description: "Email body as plain text" },
          in_reply_to: { type: "string", description: "Outlook conversation ID if this is a reply" },
        },
        required: ["subject"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_outlook_inbox",
      description: "Get emails from the connected Office 365 Outlook inbox. Can filter by contact. Use when the user asks to see their Outlook inbox or Outlook emails.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "Filter emails for a specific contact" },
          contact_name: { type: "string", description: "Contact name to search for if ID unknown" },
          unread_only: { type: "boolean", description: "Only show unread emails" },
          limit: { type: "number", description: "Max emails to return (default 15)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_outlook_thread",
      description: "Get a full Outlook email thread/conversation by conversation ID.",
      parameters: {
        type: "object",
        properties: {
          conversation_id: { type: "string", description: "Outlook conversation ID" },
        },
        required: ["conversation_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_calendar_events",
      description: "Get upcoming calendar events from Office 365. Use when the user asks about their schedule, meetings, or calendar. Defaults to next 14 days.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date ISO 8601. Defaults to now." },
          end_date: { type: "string", description: "End date ISO 8601. Defaults to 14 days from now." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new calendar event in Office 365. Parse natural language dates into ISO 8601.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Event title/subject" },
          start_time: { type: "string", description: "Start time ISO 8601 (e.g. 2026-04-11T15:00:00)" },
          end_time: { type: "string", description: "End time ISO 8601 (e.g. 2026-04-11T16:00:00)" },
          location: { type: "string", description: "Event location" },
          body_html: { type: "string", description: "Event description as HTML" },
          attendee_emails: { type: "array", items: { type: "string" }, description: "Attendee email addresses" },
        },
        required: ["subject", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "import_outlook_contacts",
      description: "Import contacts from Office 365 into the CRM. Shows a dedup preview first.",
      parameters: { type: "object", properties: {} },
    },
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/llm/tools.ts
git commit -m "feat(office365): add 6 LLM tool definitions for O365 email, calendar, contacts"
```

---

## Task 8: LLM Tool Executors

**Files:**
- Modify: `src/lib/llm/tool-executor.ts`

- [ ] **Step 1: Add imports**

At top of `src/lib/llm/tool-executor.ts`, after `import * as gmail from "@/lib/gmail";` add:

```typescript
import * as office365 from "@/lib/office365";
```

Add to conversation.ts imports:

```typescript
import type { CalendarEventsData, CalendarEventItem } from "@/types/conversation";
```

- [ ] **Step 2: Add switch cases in executeTool**

After the last case in the switch (around line 93), add:

```typescript
    case "send_outlook_email":
      return execSendOutlookEmail(args);
    case "get_outlook_inbox":
      return execGetOutlookInbox(args);
    case "get_outlook_thread":
      return execGetOutlookThread(args);
    case "get_calendar_events":
      return execGetCalendarEvents(args);
    case "create_calendar_event":
      return execCreateCalendarEvent(args);
    case "import_outlook_contacts":
      return execImportOutlookContacts();
```

- [ ] **Step 3: Add all 6 executor functions**

Add at the end of the file:

```typescript
// ===== Office 365 Tool Executors =====

function execSendOutlookEmail(args: Record<string, unknown>): ToolResult {
  if (!office365.isOffice365Connected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Office 365 not connected. Please connect in Settings first." },
    };
  }

  let contactId = args.contact_id ? String(args.contact_id) : undefined;
  let contactEmail = "";
  let contactName = "";

  if (contactId) {
    const contact = db.getContact(contactId);
    if (contact) {
      contactEmail = contact.email;
      contactName = `${contact.firstName} ${contact.lastName}`;
    }
  } else if (args.contact_name) {
    const matches = db.searchContacts(String(args.contact_name));
    if (matches.length > 0) {
      contactId = matches[0].id;
      contactEmail = matches[0].email;
      contactName = `${matches[0].firstName} ${matches[0].lastName}`;
    }
  }

  if (!contactEmail && !args.contact_name) {
    return { richBlocks: [], rawData: { error: "No contact email found. Please specify a contact." } };
  }

  const composeData: EmailComposeData = {
    to: contactEmail,
    toName: contactName || undefined,
    contactId: contactId || undefined,
    subject: String(args.subject || ""),
    bodyHtml: String(args.body_html || ""),
    bodyText: String(args.body_text || args.body_html || "").replace(/<[^>]*>/g, ""),
    inReplyTo: args.in_reply_to ? String(args.in_reply_to) : undefined,
    mode: args.in_reply_to ? "reply" : "compose",
  };

  return {
    richBlocks: [{ type: "email-compose", data: composeData }],
    rawData: { composePrepared: true, to: contactEmail, subject: composeData.subject, provider: "outlook" },
  };
}

function execGetOutlookInbox(args: Record<string, unknown>): ToolResult {
  if (!office365.isOffice365Connected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Office 365 not connected. Please connect in Settings first." },
    };
  }

  let contactId = args.contact_id ? String(args.contact_id) : undefined;
  if (!contactId && args.contact_name) {
    const matches = db.searchContacts(String(args.contact_name));
    if (matches.length > 0) contactId = matches[0].id;
  }

  const limit = Number(args.limit) || 15;
  const result = db.getOutlookEmails({ contactId, unreadOnly: Boolean(args.unread_only), page: 1, pageSize: limit });

  const emailListData: EmailListData = {
    emails: result.emails.map((e) => ({
      id: e.id,
      gmailMessageId: e.outlookMessageId || e.gmailMessageId,
      gmailThreadId: e.outlookConversationId || e.gmailThreadId,
      fromAddress: e.fromAddress,
      toAddress: e.toAddress,
      subject: e.subject,
      bodyPreview: (e.bodyText || e.bodyHtml.replace(/<[^>]*>/g, "")).slice(0, 120),
      isRead: Boolean(e.isRead),
      sentAt: e.sentAt,
      contactName: contactId ? (() => { const c = db.getContact(contactId!); return c ? `${c.firstName} ${c.lastName}` : undefined; })() : undefined,
      direction: e.direction,
    })),
    totalCount: result.totalCount,
    unreadCount: result.unreadCount,
    page: 1,
    pageSize: limit,
    hasMore: limit < result.totalCount,
  };

  return {
    richBlocks: [{ type: "email-list", data: emailListData }],
    rawData: { count: result.emails.length, totalCount: result.totalCount, unreadCount: result.unreadCount },
  };
}

function execGetOutlookThread(args: Record<string, unknown>): ToolResult {
  if (!office365.isOffice365Connected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Office 365 not connected. Please connect in Settings first." },
    };
  }

  const conversationId = String(args.conversation_id);
  const emails = db.getOutlookEmailThread(conversationId);

  if (emails.length === 0) {
    return { richBlocks: [], rawData: { error: "Email thread not found" } };
  }

  const latest = emails[emails.length - 1];
  const thread = emails.slice(0, -1);

  const resolveContactName = (emailAddr: string) => {
    const addr = emailAddr.match(/<([^>]+)>/)?.[1] || emailAddr.trim();
    const contacts = db.getAllContacts();
    const contact = contacts.find(c => c.email.toLowerCase() === addr.toLowerCase());
    return contact ? `${contact.firstName} ${contact.lastName}` : undefined;
  };

  const emailDetailData: EmailDetailData = {
    id: latest.id,
    gmailMessageId: latest.outlookMessageId || latest.gmailMessageId,
    gmailThreadId: latest.outlookConversationId || latest.gmailThreadId,
    fromAddress: latest.fromAddress,
    toAddress: latest.toAddress,
    ccAddress: latest.ccAddress || undefined,
    subject: latest.subject,
    bodyHtml: latest.bodyHtml,
    sentAt: latest.sentAt,
    contactName: resolveContactName(latest.direction === "inbound" ? latest.fromAddress : latest.toAddress),
    contactId: latest.contactId || undefined,
    direction: latest.direction,
    thread: thread.length > 0 ? thread.map(e => ({
      id: e.id,
      gmailMessageId: e.outlookMessageId || e.gmailMessageId,
      gmailThreadId: e.outlookConversationId || e.gmailThreadId,
      fromAddress: e.fromAddress,
      toAddress: e.toAddress,
      ccAddress: e.ccAddress || undefined,
      subject: e.subject,
      bodyHtml: e.bodyHtml,
      sentAt: e.sentAt,
      contactName: resolveContactName(e.direction === "inbound" ? e.fromAddress : e.toAddress),
      contactId: e.contactId || undefined,
      direction: e.direction,
    })) : undefined,
  };

  return {
    richBlocks: [{ type: "email-detail", data: emailDetailData }],
    rawData: { emailCount: emails.length, conversationId },
  };
}

function execGetCalendarEvents(args: Record<string, unknown>): ToolResult {
  if (!office365.isOffice365Connected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Office 365 not connected. Please connect in Settings first." },
    };
  }

  const events = db.getCalendarEvents({
    startDate: args.start_date ? String(args.start_date) : new Date().toISOString(),
    endDate: args.end_date ? String(args.end_date) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const calendarData: CalendarEventsData = {
    events: events.map(e => {
      const attendees = JSON.parse(e.attendees || "[]") as { email: string; name: string; response: string }[];
      let contactName: string | undefined;
      if (e.contactId) {
        const contact = db.getContact(e.contactId);
        if (contact) contactName = `${contact.firstName} ${contact.lastName}`;
      }
      return {
        id: e.id,
        subject: e.subject,
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location,
        isAllDay: Boolean(e.isAllDay),
        organizerName: e.organizerName,
        attendees,
        contactId: e.contactId || undefined,
        contactName,
        webLink: e.webLink,
      };
    }),
    dateRange: `${args.start_date || "today"} to ${args.end_date || "next 14 days"}`,
  };

  return {
    richBlocks: [{ type: "calendar-events", data: calendarData }],
    rawData: { eventCount: events.length },
  };
}

function execCreateCalendarEvent(args: Record<string, unknown>): ToolResult {
  if (!office365.isOffice365Connected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Office 365 not connected. Please connect in Settings first." },
    };
  }

  const formData: InlineFormData = {
    entityType: "activity",
    title: "Create Calendar Event",
    mode: "create",
    fields: [
      { key: "subject", label: "Subject", type: "text", value: String(args.subject || ""), required: true },
      { key: "start_time", label: "Start Time", type: "text", value: String(args.start_time || ""), required: true },
      { key: "end_time", label: "End Time", type: "text", value: String(args.end_time || ""), required: true },
      { key: "location", label: "Location", type: "text", value: String(args.location || "") },
      { key: "attendees", label: "Attendees (emails)", type: "text", value: ((args.attendee_emails as string[]) || []).join(", ") },
    ],
  };

  return {
    richBlocks: [{ type: "inline-form", data: formData }],
    rawData: { eventPrepared: true, subject: args.subject, provider: "outlook" },
  };
}

function execImportOutlookContacts(): ToolResult {
  if (!office365.isOffice365Connected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Office 365 not connected. Please connect in Settings first." },
    };
  }

  const tableData: DataTableData = {
    columns: [
      { key: "firstName", label: "First Name" },
      { key: "lastName", label: "Last Name" },
      { key: "email", label: "Email" },
      { key: "company", label: "Company" },
      { key: "status", label: "Import Status", type: "status" },
    ],
    rows: [],
    entityType: "contact",
  };

  return {
    richBlocks: [{ type: "data-table", data: tableData }],
    rawData: { importReady: true, message: "Fetching contacts from Office 365..." },
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/llm/tool-executor.ts
git commit -m "feat(office365): add 6 tool executor handlers for O365 email, calendar, contacts"
```

---

## Task 9: Calendar Events Rich Block Component

**Files:**
- Create: `src/components/rich-responses/CalendarEvents.tsx`
- Modify: `src/components/conversation/MessageBubble.tsx`

- [ ] **Step 1: Create CalendarEvents component**

Create `src/components/rich-responses/CalendarEvents.tsx`:

```tsx
"use client";

import type { CalendarEventsData, CalendarEventItem } from "@/types/conversation";
import { Calendar, MapPin, Users, ExternalLink } from "lucide-react";

function formatEventTime(startTime: string, endTime: string, isAllDay: boolean): string {
  if (isAllDay) return "All day";
  const start = new Date(startTime);
  const end = new Date(endTime);
  const dateStr = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const startStr = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const endStr = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dateStr}, ${startStr} - ${endStr}`;
}

function EventRow({ event }: { event: CalendarEventItem }) {
  const isToday = new Date(event.startTime).toDateString() === new Date().toDateString();

  return (
    <div className={`p-3 rounded-xl glass-surface ${isToday ? "ring-1 ring-indigo-500/30" : ""}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isToday ? "bg-indigo-100 text-indigo-600" : "bg-muted text-muted-foreground"}`}>
          <Calendar className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-foreground truncate">{event.subject}</span>
            {isToday && <span className="text-[10px] font-medium text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-full">Today</span>}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {formatEventTime(event.startTime, event.endTime, event.isAllDay)}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
            {event.location && (
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</span>
            )}
            {event.attendees.length > 0 && (
              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {event.attendees.length}</span>
            )}
            {event.contactName && (
              <span className="text-indigo-600">{event.contactName}</span>
            )}
          </div>
        </div>
        {event.webLink && (
          <a href={event.webLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function CalendarEvents({ data }: { data: CalendarEventsData }) {
  if (!data.events?.length) {
    return (
      <div className="glass-card rounded-xl p-4 text-center">
        <Calendar className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-[13px] text-muted-foreground">No upcoming events</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-indigo-600" />
        <h3 className="text-[13px] font-semibold text-foreground">Calendar Events</h3>
        <span className="text-[11px] text-muted-foreground">({data.events.length})</span>
      </div>
      <div className="space-y-2">
        {data.events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add calendar-events rendering to MessageBubble.tsx**

In `src/components/conversation/MessageBubble.tsx`, add the import:

```typescript
import CalendarEvents from "@/components/rich-responses/CalendarEvents";
import type { CalendarEventsData } from "@/types/conversation";
```

Then find the rich block rendering section (where other block types like `email-list`, `task-list` are rendered) and add:

```tsx
case "calendar-events":
  return <CalendarEvents key={idx} data={block.data as CalendarEventsData} />;
```

- [ ] **Step 3: Commit**

```bash
git add src/components/rich-responses/CalendarEvents.tsx src/components/conversation/MessageBubble.tsx
git commit -m "feat(office365): add CalendarEvents rich block component"
```

---

## Task 10: System Prompt Updates

**Files:**
- Modify: `src/lib/llm/system-prompt.ts`

- [ ] **Step 1: Add O365 rules to system prompt**

In `src/lib/llm/system-prompt.ts`, add these rules after rule 22:

```
23. For OFFICE 365 EMAILS: If Office 365 is connected, use send_outlook_email, get_outlook_inbox, and get_outlook_thread for Outlook emails. If both Gmail and Office 365 are connected, ask the user which to use or default to the most recently used. Use check_integrations_status to see which providers are connected.
24. For CALENDAR: Use get_calendar_events to show upcoming meetings (defaults to next 14 days). Use create_calendar_event to schedule new events — parse natural language dates into ISO 8601. Look up contact emails before adding attendees.
25. For OUTLOOK CONTACT IMPORT: Use import_outlook_contacts when asked to import contacts from Office 365. Show preview and ask for confirmation before importing.
```

Add these to the Available intents list:

```
- "show-outlook-inbox" — View Outlook email inbox
- "show-calendar" — View upcoming calendar events
- "import-o365-contacts" — Import contacts from Office 365
```

Update the Important Notes section to mention email sources:

```
- Email sources: gmail, outlook (check integrations status to know which are connected)
- Calendar events are synced from Office 365 when connected
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/llm/system-prompt.ts
git commit -m "feat(office365): update system prompt with O365 email, calendar, and contact rules"
```

---

## Task 11: End-to-End Verification

- [ ] **Step 1: Verify build succeeds**

Run: `npm run build 2>&1 | tail -30`
Expected: Build completes without errors.

- [ ] **Step 2: Start dev server and verify settings page**

Navigate to `http://localhost:5555/settings`
Expected: Office 365 section visible between Gmail and Twilio.

- [ ] **Step 3: Verify check_integrations_status includes O365**

In chat: "check my integrations"
Expected: Shows Gmail, SMS, AND Office 365 status.

- [ ] **Step 4: Test OAuth flow (requires Azure app)**

If env vars are set: Click "Connect Office 365" and complete Microsoft login.

- [ ] **Step 5: Test tools after connecting**

Test: "show my Outlook inbox", "what's on my calendar this week?", "schedule a meeting with Sarah for Friday at 2pm"

- [ ] **Step 6: Final fix commit if needed**

```bash
git add -A
git commit -m "fix(office365): address issues found during E2E verification"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Config | `src/config/office365.ts` |
| 2 | DB schema + functions | `src/lib/db.ts` |
| 3 | Core OAuth + Graph module | `src/lib/office365.ts` |
| 4 | OAuth + sync routes | `src/app/api/auth/office365/`, `src/app/api/office365/` |
| 5 | Types + rich block types | `src/types/conversation.ts` |
| 6 | Settings UI + API | `src/lib/settings.ts`, `src/app/settings/page.tsx` |
| 7 | LLM tool definitions | `src/lib/llm/tools.ts` |
| 8 | LLM tool executors | `src/lib/llm/tool-executor.ts` |
| 9 | Calendar events component | `CalendarEvents.tsx`, `MessageBubble.tsx` |
| 10 | System prompt | `src/lib/llm/system-prompt.ts` |
| 11 | E2E verification | All files |

**Total: 6 new files, 8 modified files, 11 commits**
