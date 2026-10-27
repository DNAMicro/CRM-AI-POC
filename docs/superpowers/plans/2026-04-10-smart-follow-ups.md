# Smart Follow-up Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI proactively help the user stay on top of deals and relationships — stale deal alerts, follow-up reminders, next-action suggestions, email templates, scheduled sends, and a morning briefing.

**Architecture:** A new `src/lib/follow-ups.ts` module provides the business logic for stale detection, follow-up scoring, and next-action recommendations. Email templates and scheduled messages get new DB tables. All features are exposed as 8 new LLM tools, rendered through existing DynamicUI and rich block primitives. The morning briefing enhances the existing greeting with stale deals + follow-ups + calendar.

**Tech Stack:** SQLite (better-sqlite3), existing DynamicUI system, existing tool-calling pipeline

**Spec:** `docs/superpowers/specs/2026-04-10-crm-advanced-features-design.md` (Phase 2)

---

## File Structure

### New files:
- `src/lib/follow-ups.ts` — Business logic: stale deal detection, follow-up suggestions, next-action recommendations, template interpolation, morning briefing composer

### Modified files:
- `src/lib/db.ts` — New tables (`email_templates`, `scheduled_messages`), new query functions
- `src/lib/llm/tools.ts` — 8 new tool definitions
- `src/lib/llm/tool-executor.ts` — 8 new tool execution handlers
- `src/lib/llm/system-prompt.ts` — New rules for follow-ups, templates, scheduling, briefing
- `src/lib/api-client.ts` — Enhanced greeting with stale deals + follow-ups
- `src/app/api/stats/route.ts` — Include stale deal + follow-up counts in stats

---

## Task 1: Database Tables and Query Functions

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add email_templates and scheduled_messages tables to initSchema**

Inside the `db.exec(...)` template string in `initSchema`, add after the `calendar_events` indexes:

```sql
    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      bodyHtml TEXT NOT NULL,
      bodyText TEXT NOT NULL,
      mergeFields TEXT DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('email', 'sms')),
      provider TEXT NOT NULL DEFAULT 'gmail' CHECK(provider IN ('gmail', 'outlook', 'twilio')),
      contactId TEXT,
      recipientAddress TEXT NOT NULL,
      subject TEXT DEFAULT '',
      bodyHtml TEXT DEFAULT '',
      bodyText TEXT DEFAULT '',
      scheduledAt TEXT NOT NULL,
      sentAt TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed', 'cancelled')),
      createdAt TEXT NOT NULL,
      FOREIGN KEY (contactId) REFERENCES contacts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_messages(status);
    CREATE INDEX IF NOT EXISTS idx_scheduled_time ON scheduled_messages(scheduledAt);
```

- [ ] **Step 2: Add EmailTemplate interface and CRUD functions**

Add after the calendar event queries:

```typescript
// ===== EMAIL TEMPLATE QUERIES =====

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  mergeFields: string;
  createdAt: string;
  updatedAt: string;
}

export function insertEmailTemplate(data: { name: string; subject: string; bodyHtml: string; bodyText: string; mergeFields?: string[] }): EmailTemplate {
  const db = getDb();
  const id = `tmpl${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO email_templates (id, name, subject, bodyHtml, bodyText, mergeFields, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.subject, data.bodyHtml, data.bodyText, JSON.stringify(data.mergeFields || []), now, now);
  return db.prepare("SELECT * FROM email_templates WHERE id = ?").get(id) as EmailTemplate;
}

export function getAllEmailTemplates(): EmailTemplate[] {
  return getDb().prepare("SELECT * FROM email_templates ORDER BY updatedAt DESC").all() as EmailTemplate[];
}

export function getEmailTemplate(id: string): EmailTemplate | undefined {
  return getDb().prepare("SELECT * FROM email_templates WHERE id = ?").get(id) as EmailTemplate | undefined;
}

export function deleteEmailTemplate(id: string): void {
  getDb().prepare("DELETE FROM email_templates WHERE id = ?").run(id);
}
```

- [ ] **Step 3: Add ScheduledMessage interface and functions**

```typescript
// ===== SCHEDULED MESSAGE QUERIES =====

export interface ScheduledMessage {
  id: string;
  type: "email" | "sms";
  provider: "gmail" | "outlook" | "twilio";
  contactId: string | null;
  recipientAddress: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  scheduledAt: string;
  sentAt: string | null;
  status: "pending" | "sent" | "failed" | "cancelled";
  createdAt: string;
}

export function insertScheduledMessage(data: {
  type: "email" | "sms";
  provider: "gmail" | "outlook" | "twilio";
  contactId?: string;
  recipientAddress: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  scheduledAt: string;
}): ScheduledMessage {
  const db = getDb();
  const id = `sched${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO scheduled_messages (id, type, provider, contactId, recipientAddress, subject, bodyHtml, bodyText, scheduledAt, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, data.type, data.provider, data.contactId || null, data.recipientAddress, data.subject || "", data.bodyHtml || "", data.bodyText || "", data.scheduledAt, now);
  return db.prepare("SELECT * FROM scheduled_messages WHERE id = ?").get(id) as ScheduledMessage;
}

export function getPendingScheduledMessages(): ScheduledMessage[] {
  const now = new Date().toISOString();
  return getDb().prepare(
    "SELECT * FROM scheduled_messages WHERE status = 'pending' AND scheduledAt <= ? ORDER BY scheduledAt ASC"
  ).all(now) as ScheduledMessage[];
}

export function getScheduledMessages(opts?: { status?: string; contactId?: string }): ScheduledMessage[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts?.status) { conditions.push("status = ?"); params.push(opts.status); }
  if (opts?.contactId) { conditions.push("contactId = ?"); params.push(opts.contactId); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return getDb().prepare(`SELECT * FROM scheduled_messages ${where} ORDER BY scheduledAt DESC`).all(...params) as ScheduledMessage[];
}

export function updateScheduledMessageStatus(id: string, status: "sent" | "failed" | "cancelled", sentAt?: string): void {
  getDb().prepare("UPDATE scheduled_messages SET status = ?, sentAt = ? WHERE id = ?").run(status, sentAt || null, id);
}
```

- [ ] **Step 4: Add stale-deal helper queries**

Add after existing activity queries:

```typescript
export function getLastActivityDateForDeal(dealId: string): string | null {
  const row = getDb().prepare(
    "SELECT MAX(timestamp) as lastActivity FROM activities WHERE dealId = ?"
  ).get(dealId) as { lastActivity: string | null };
  return row?.lastActivity || null;
}

export function getLastActivityDateForContact(contactId: string): string | null {
  const row = getDb().prepare(
    "SELECT MAX(timestamp) as lastActivity FROM activities WHERE contactId = ?"
  ).get(contactId) as { lastActivity: string | null };
  return row?.lastActivity || null;
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build 2>&1 | tail -10`

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat(follow-ups): add email_templates, scheduled_messages tables and query functions"
```

---

## Task 2: Follow-up Business Logic Module

**Files:**
- Create: `src/lib/follow-ups.ts`

- [ ] **Step 1: Create the follow-ups module**

Read the plan file `docs/superpowers/plans/2026-04-10-smart-follow-ups.md` Task 2 for the complete source code. Create `src/lib/follow-ups.ts` with:

1. **Stale Deal Detection** — `getStaleDealsList(opts?)` returns `StaleDeal[]` with severity (warm/cold/at-risk based on 7/14/21 day thresholds)
2. **Follow-up Suggestions** — `getFollowUpSuggestions(opts?)` returns `FollowUpSuggestion[]` with priority scoring based on deal value and inactivity
3. **Next-Action Suggestions** — `getNextActions(opts?)` returns `NextAction[]` with stage-appropriate recommendations
4. **Template Interpolation** — `interpolateTemplate(template, context)` replaces merge fields like `{{contact.firstName}}`
5. **Morning Briefing** — `getMorningBriefing()` returns `MorningBriefing` compositing all of the above plus tasks and calendar

The complete code follows. Create the file with this exact content:

```typescript
import * as db from "@/lib/db";
import type { Deal, Contact } from "@/types/crm";

// ===== Stale Deal Detection =====

export interface StaleDeal {
  deal: Deal;
  contactName: string;
  daysSinceActivity: number;
  lastActivityDate: string | null;
  lastActivityType: string | null;
  severity: "warm" | "cold" | "at-risk";
}

export function getStaleDealsList(opts?: { minDays?: number }): StaleDeal[] {
  const minDays = opts?.minDays || 7;
  const activeDeals = db.getActiveDeals();
  const now = Date.now();
  const results: StaleDeal[] = [];

  for (const deal of activeDeals) {
    const lastActivity = db.getLastActivityDateForDeal(deal.id);
    const lastContactActivity = deal.contactId ? db.getLastActivityDateForContact(deal.contactId) : null;
    const lastDate = lastActivity || lastContactActivity || deal.updatedAt;
    const daysSince = Math.floor((now - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince >= minDays) {
      const contact = deal.contactId ? db.getContact(deal.contactId) : undefined;
      const activities = db.getActivitiesByDeal(deal.id);
      const lastAct = activities.length > 0 ? activities[0] : null;

      results.push({
        deal,
        contactName: contact ? `${contact.firstName} ${contact.lastName}` : deal.company,
        daysSinceActivity: daysSince,
        lastActivityDate: lastDate,
        lastActivityType: lastAct?.type || null,
        severity: daysSince >= 21 ? "at-risk" : daysSince >= 14 ? "cold" : "warm",
      });
    }
  }

  return results.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
}

// ===== Follow-up Suggestions =====

export interface FollowUpSuggestion {
  contactId: string;
  contactName: string;
  email: string;
  daysSinceContact: number;
  reason: string;
  suggestedAction: string;
  priority: "high" | "medium" | "low";
  relatedDeals: { id: string; name: string; stage: string; value: number }[];
}

export function getFollowUpSuggestions(opts?: { days?: number; limit?: number }): FollowUpSuggestion[] {
  const days = opts?.days || 5;
  const limit = opts?.limit || 10;
  const contacts = db.getContactsNeedingFollowUp(days);
  const results: FollowUpSuggestion[] = [];

  for (const contact of contacts) {
    const deals = db.getDealsByContact(contact.id);
    const activeDeals = deals.filter(d => d.stage !== "closed-won" && d.stage !== "closed-lost");
    const daysSince = Math.floor((Date.now() - new Date(contact.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24));

    let reason = `No contact in ${daysSince} days`;
    let suggestedAction = "Send a check-in email";
    let priority: "high" | "medium" | "low" = "medium";

    if (activeDeals.length > 0) {
      const highValueDeal = activeDeals.find(d => d.value > 10000);
      if (highValueDeal) {
        reason = `${daysSince} days since contact — has $${highValueDeal.value.toLocaleString()} deal in ${highValueDeal.stage}`;
        suggestedAction = `Follow up on "${highValueDeal.name}"`;
        priority = "high";
      } else {
        reason = `${daysSince} days since contact — ${activeDeals.length} active deal${activeDeals.length > 1 ? "s" : ""}`;
        suggestedAction = `Check in about "${activeDeals[0].name}"`;
      }
    }

    if (daysSince >= 14) priority = "high";

    results.push({
      contactId: contact.id,
      contactName: `${contact.firstName} ${contact.lastName}`,
      email: contact.email,
      daysSinceContact: daysSince,
      reason,
      suggestedAction,
      priority,
      relatedDeals: activeDeals.map(d => ({ id: d.id, name: d.name, stage: d.stage, value: d.value })),
    });
  }

  return results
    .sort((a, b) => {
      const pOrder = { high: 0, medium: 1, low: 2 };
      return pOrder[a.priority] - pOrder[b.priority] || b.daysSinceContact - a.daysSinceContact;
    })
    .slice(0, limit);
}

// ===== Next-Action Suggestions =====

export interface NextAction {
  dealId: string;
  dealName: string;
  contactName: string;
  stage: string;
  suggestedAction: string;
  reasoning: string;
  priority: "high" | "medium" | "low";
}

const STAGE_ACTIONS: Record<string, { action: string; reasoning: string }> = {
  lead: { action: "Qualify this lead — schedule a discovery call", reasoning: "New leads should be qualified within 48 hours" },
  qualified: { action: "Send a proposal or schedule a demo", reasoning: "Qualified deals need a concrete next step to keep momentum" },
  proposal: { action: "Follow up on the proposal — check if they have questions", reasoning: "Proposals go cold quickly without follow-up" },
  negotiation: { action: "Address any remaining objections and push for close", reasoning: "Negotiation deals are close to a decision — keep pressure gentle but consistent" },
};

export function getNextActions(opts?: { dealId?: string }): NextAction[] {
  const deals = opts?.dealId ? [db.getDeal(opts.dealId)].filter(Boolean) as Deal[] : db.getActiveDeals();
  const results: NextAction[] = [];

  for (const deal of deals) {
    const contact = deal.contactId ? db.getContact(deal.contactId) : undefined;
    const stageInfo = STAGE_ACTIONS[deal.stage];
    if (!stageInfo) continue;

    const activities = db.getActivitiesByDeal(deal.id);
    const lastActivity = activities[0];
    const daysSinceActivity = lastActivity
      ? Math.floor((Date.now() - new Date(lastActivity.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    let { action, reasoning } = stageInfo;
    let priority: "high" | "medium" | "low" = "medium";

    if (daysSinceActivity > 7) {
      action = `Re-engage — ${daysSinceActivity} days since last activity. ${action}`;
      priority = "high";
    }
    if (deal.priority === "high") priority = "high";

    results.push({
      dealId: deal.id,
      dealName: deal.name,
      contactName: contact ? `${contact.firstName} ${contact.lastName}` : deal.company,
      stage: deal.stage,
      suggestedAction: action,
      reasoning,
      priority,
    });
  }

  return results.sort((a, b) => {
    const pOrder = { high: 0, medium: 1, low: 2 };
    return pOrder[a.priority] - pOrder[b.priority];
  });
}

// ===== Email Template Helpers =====

export function interpolateTemplate(template: db.EmailTemplate, context: {
  contactFirstName?: string;
  contactLastName?: string;
  contactEmail?: string;
  contactCompany?: string;
  dealName?: string;
  dealValue?: string;
  dealStage?: string;
  userName?: string;
}): { subject: string; bodyHtml: string; bodyText: string } {
  const replacements: Record<string, string> = {
    "{{contact.firstName}}": context.contactFirstName || "",
    "{{contact.lastName}}": context.contactLastName || "",
    "{{contact.email}}": context.contactEmail || "",
    "{{contact.company}}": context.contactCompany || "",
    "{{deal.name}}": context.dealName || "",
    "{{deal.value}}": context.dealValue || "",
    "{{deal.stage}}": context.dealStage || "",
    "{{user.name}}": context.userName || "",
  };

  let subject = template.subject;
  let bodyHtml = template.bodyHtml;
  let bodyText = template.bodyText;

  for (const [key, value] of Object.entries(replacements)) {
    subject = subject.replaceAll(key, value);
    bodyHtml = bodyHtml.replaceAll(key, value);
    bodyText = bodyText.replaceAll(key, value);
  }

  return { subject, bodyHtml, bodyText };
}

// ===== Morning Briefing =====

export interface MorningBriefing {
  greeting: string;
  staleDeals: StaleDeal[];
  followUps: FollowUpSuggestion[];
  nextActions: NextAction[];
  overdueTasks: import("@/types/crm").Task[];
  todayTasks: import("@/types/crm").Task[];
  todayCalendarEvents: db.CalendarEventRow[];
  stats: {
    activeDeals: number;
    pipelineValue: number;
    closingThisMonth: number;
    pendingTasks: number;
  };
}

export function getMorningBriefing(): MorningBriefing {
  const userName = db.getSetting("user_name") || "there";
  const stats = db.getDashboardStats();
  const taskStats = db.getTaskStats();
  const staleDeals = getStaleDealsList({ minDays: 7 });
  const followUps = getFollowUpSuggestions({ limit: 5 });
  const nextActions = getNextActions();
  const overdueTasks = db.getOverdueTasks().slice(0, 5);
  const todayTasks = db.getTasksDueToday().slice(0, 5);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayCalendarEvents = db.getCalendarEvents({
    startDate: todayStart.toISOString(),
    endDate: todayEnd.toISOString(),
  });

  const parts: string[] = [`Good morning, ${userName}.`];
  if (staleDeals.length > 0) parts.push(`You have **${staleDeals.length} stale deal${staleDeals.length > 1 ? "s" : ""}** needing attention.`);
  if (overdueTasks.length > 0) parts.push(`**${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}**.`);
  if (todayTasks.length > 0) parts.push(`**${todayTasks.length} task${todayTasks.length > 1 ? "s" : ""} due today**.`);
  if (todayCalendarEvents.length > 0) parts.push(`**${todayCalendarEvents.length} meeting${todayCalendarEvents.length > 1 ? "s" : ""}** on your calendar.`);
  if (followUps.length > 0) parts.push(`**${followUps.length} contact${followUps.length > 1 ? "s" : ""}** need${followUps.length === 1 ? "s" : ""} follow-up.`);
  parts.push(`Pipeline: **${stats.activeDealsCount} deals** worth **$${Math.round(stats.pipelineValue).toLocaleString()}**.`);

  return {
    greeting: parts.join(" "),
    staleDeals,
    followUps,
    nextActions: nextActions.slice(0, 5),
    overdueTasks,
    todayTasks,
    todayCalendarEvents,
    stats: {
      activeDeals: stats.activeDealsCount,
      pipelineValue: stats.pipelineValue,
      closingThisMonth: stats.closingThisMonthCount,
      pendingTasks: taskStats.pendingCount,
    },
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`

- [ ] **Step 3: Commit**

```bash
git add src/lib/follow-ups.ts
git commit -m "feat(follow-ups): add business logic for stale deals, follow-ups, next actions, morning briefing"
```

---

## Task 3: LLM Tool Definitions

**Files:**
- Modify: `src/lib/llm/tools.ts`

- [ ] **Step 1: Add 8 tool definitions after `import_outlook_contacts`**

Read the plan file Task 3 for the exact tool definitions. Add all 8 tools (`get_stale_deals`, `get_follow_up_suggestions`, `get_next_actions`, `create_email_template`, `list_email_templates`, `apply_email_template`, `schedule_message`, `get_morning_briefing`) to `src/lib/llm/tools.ts` after the `import_outlook_contacts` tool.

- [ ] **Step 2: Commit**

```bash
git add src/lib/llm/tools.ts
git commit -m "feat(follow-ups): add 8 LLM tool definitions for smart follow-ups"
```

---

## Task 4: LLM Tool Executors

**Files:**
- Modify: `src/lib/llm/tool-executor.ts`

- [ ] **Step 1: Add import**

After `import * as office365 from "@/lib/office365";` add:

```typescript
import * as followUps from "@/lib/follow-ups";
```

- [ ] **Step 2: Add 8 switch cases in executeTool**

After the `import_outlook_contacts` case, add cases for all 8 new tools.

- [ ] **Step 3: Implement all 8 executor functions**

Read the plan file Task 4 Steps 3-10 for the complete code of each handler:

1. `execGetStaleDeals` — queries `followUps.getStaleDealsList()`, returns `dynamic-ui` with table + callout
2. `execGetFollowUpSuggestions` — queries `followUps.getFollowUpSuggestions()`, returns `dynamic-ui` with cards per contact
3. `execGetNextActions` — queries `followUps.getNextActions()`, returns `dynamic-ui` with cards per deal
4. `execCreateEmailTemplate` — calls `db.insertEmailTemplate()`, extracts merge fields from content
5. `execListEmailTemplates` — calls `db.getAllEmailTemplates()`, returns `data-table`
6. `execApplyEmailTemplate` — resolves template + contact + deal, interpolates, returns `email-compose`
7. `execScheduleMessage` — resolves contact, calls `db.insertScheduledMessage()`, confirms scheduling
8. `execGetMorningBriefing` — calls `followUps.getMorningBriefing()`, returns `dynamic-ui` composite

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -10`

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/tool-executor.ts
git commit -m "feat(follow-ups): add 8 tool executor handlers for smart follow-ups"
```

---

## Task 5: Enhanced Greeting and Stats

**Files:**
- Modify: `src/app/api/stats/route.ts`
- Modify: `src/lib/api-client.ts`

- [ ] **Step 1: Add stale deal and follow-up counts to stats API**

In `src/app/api/stats/route.ts`, add import:

```typescript
import { getStaleDealsList, getFollowUpSuggestions } from "@/lib/follow-ups";
```

Update GET handler to include:

```typescript
  const staleDealsCount = getStaleDealsList({ minDays: 7 }).length;
  const followUpSuggestionsCount = getFollowUpSuggestions({ limit: 100 }).length;
  return NextResponse.json({
    ...stats,
    userName,
    ...taskStats,
    overdueTasks,
    todayTasks,
    staleDealsCount,
    followUpSuggestionsCount,
  });
```

- [ ] **Step 2: Add stale deals to greeting and morning briefing chip**

In `src/lib/api-client.ts`, in `buildGreetingFromStats`:

Add stale deal mention to content string:
```typescript
  const staleCount = (stats as Record<string, unknown>).staleDealsCount as number || 0;
  const stalePart = staleCount > 0 ? ` **${staleCount} deal${staleCount > 1 ? "s" : ""}** need attention.` : "";
```

Append `${stalePart}` to the content string after taskSummary.

Add briefing chip:
```typescript
  suggestedChips.push({ label: "Morning briefing", intent: "morning-briefing" });
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/stats/route.ts src/lib/api-client.ts
git commit -m "feat(follow-ups): enhance greeting with stale deal count and briefing chip"
```

---

## Task 6: System Prompt Updates

**Files:**
- Modify: `src/lib/llm/system-prompt.ts`

- [ ] **Step 1: Add rules 26-31 after rule 25**

```
26. For STALE DEALS: Use get_stale_deals when asked about neglected deals, deals needing attention, or deals with no recent activity. Suggest specific actions: send a follow-up email, schedule a call, or move to closed-lost if the deal is dead.
27. For FOLLOW-UP SUGGESTIONS: Use get_follow_up_suggestions when asked "who should I follow up with?", "what follow-ups do I need?", or when the user seems to be planning their day. Present the list with clear next actions.
28. For NEXT ACTIONS: Use get_next_actions when asked "what should I do next?", "what are my priorities?", or "what's the next step for [deal]?". Each deal gets a stage-appropriate recommendation.
29. For EMAIL TEMPLATES: Use create_email_template when the user says "save this as a template" or "create a template called [name]". Use list_email_templates to show available templates. Use apply_email_template to pre-fill a compose form with a template for a specific contact — look up the contact first.
30. For SCHEDULED SENDS: Use schedule_message when the user says "send this tomorrow at 9am", "schedule for Friday", or any future send time. Parse natural language dates into ISO 8601. Confirm the scheduled time with the user.
31. For MORNING BRIEFING: Use get_morning_briefing when the user says "brief me", "morning briefing", "what's my day look like?", or at the start of a new conversation. Shows stale deals, follow-ups, tasks, calendar, and pipeline stats in one view.
```

- [ ] **Step 2: Add chip intents**

```
- "morning-briefing" — Get morning briefing with all priorities
- "stale-deals" — Show deals needing attention
- "follow-up-suggestions" — Who needs follow-up
- "next-actions" — What to do next for each deal
- "email-templates" — Show saved email templates
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm/system-prompt.ts
git commit -m "feat(follow-ups): update system prompt with follow-up, template, and briefing rules"
```

---

## Task 7: End-to-End Verification

- [ ] **Step 1: Verify build**

Run: `npm run build 2>&1 | tail -15`

- [ ] **Step 2: Test stale deals**

Chat: "show me stale deals"

- [ ] **Step 3: Test follow-ups**

Chat: "who should I follow up with?"

- [ ] **Step 4: Test next actions**

Chat: "what should I do next?"

- [ ] **Step 5: Test template creation**

Chat: "create an email template called Proposal Follow-up with subject Following up on our proposal and body Hi {{contact.firstName}}, checking in about {{deal.name}}."

- [ ] **Step 6: Test morning briefing**

Chat: "brief me"

- [ ] **Step 7: Fix commit if needed**

```bash
git add -A
git commit -m "fix(follow-ups): address issues found during E2E verification"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | DB tables + query functions | `src/lib/db.ts` |
| 2 | Follow-up business logic | `src/lib/follow-ups.ts` (new) |
| 3 | 8 LLM tool definitions | `src/lib/llm/tools.ts` |
| 4 | 8 tool executors | `src/lib/llm/tool-executor.ts` |
| 5 | Enhanced greeting + stats | `src/app/api/stats/route.ts`, `src/lib/api-client.ts` |
| 6 | System prompt rules | `src/lib/llm/system-prompt.ts` |
| 7 | E2E verification | All files |

**Total: 1 new file, 6 modified files, 8 new LLM tools, 7 commits**
