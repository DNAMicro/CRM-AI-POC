# CRM Advanced Features — Design Spec

**Date:** 2026-04-10
**Audience:** Solo freelancer / individual user
**Approach:** Integration-First — build real data connections first, then layer intelligence on top
**Prerequisite:** Assumes foundational spec (2026-04-10-crm-feature-roadmap-design.md) features are in place

---

## Context

The CRM AI app has a strong conversational foundation: 33 LLM tools, Gmail + Twilio SMS integration, task management, pipeline board, CSV import/export, and dynamic UI generation. The existing feature roadmap covers foundational improvements (error boundaries, schema consolidation, conversation persistence, tasks, search, pipeline polish).

This spec defines the **next layer** of features that turn the CRM from a functional prototype into a daily-driver tool for a solo freelancer. The user's top priority is **Office 365 integration**, followed by smart follow-ups, AI intelligence, and analytics. The ordering is deliberate: each phase builds on the data from the previous one.

---

## Phase 1: Office 365 Integration

**Goal:** Connect the CRM to the user's Microsoft 365 account for email, calendar, and contact sync — making the CRM the single pane of glass for all client communication.

### 1.1 OAuth2 Authentication

- Register the app with Microsoft identity platform (Azure AD)
- Implement OAuth2 Authorization Code flow with PKCE
- Store tokens (access + refresh) encrypted in the settings DB (same pattern as Gmail in `src/lib/gmail.ts`)
- Scopes: `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Contacts.Read`, `User.Read`
- New settings UI section for "Microsoft 365" connection (connect/disconnect)
- Token refresh logic with automatic retry on 401

### 1.2 Email Sync

- Pull inbox messages via Microsoft Graph API (`/me/messages`)
- Thread grouping using `conversationId`
- Support read/unread status sync
- Send/reply emails via Graph API (`/me/sendMail`)
- Periodic background sync (same polling pattern as Gmail sync)
- Auto-log emails as activities linked to matching contacts (match by email address)
- Display in the same unified activity timeline alongside Gmail emails and SMS

### 1.3 Calendar Sync

- Pull calendar events via Graph API (`/me/events`)
- Show upcoming meetings in conversation context (e.g., "You have a meeting with John at 2pm")
- Create calendar events from chat ("schedule a call with Sarah for Thursday at 3pm")
- Link calendar events to contacts/deals when participants match
- Display in activity timeline as `meeting` type activities

### 1.4 Contact Import

- Pull contacts via Graph API (`/me/contacts`)
- Map O365 fields to CRM contact schema (name, email, phone, company, title)
- Deduplicate against existing contacts (match on email address)
- Allow user to review and confirm imports via conversational UI (inline form)
- One-time import + optional periodic sync

### 1.5 New LLM Tools

| Tool | Purpose |
|------|---------|
| `send_outlook_email` | Compose and send email via O365 |
| `get_outlook_inbox` | Fetch recent emails from O365 inbox |
| `get_outlook_thread` | Fetch full email thread by conversationId |
| `get_calendar_events` | Fetch upcoming calendar events (supports date range) |
| `create_calendar_event` | Create a new calendar event with attendees |
| `import_outlook_contacts` | Import contacts from O365 with dedup preview |

### 1.6 Architecture

- **New module:** `src/lib/outlook.ts` — Graph API client, token management, email/calendar/contact operations
- **New API routes:** `src/app/api/outlook/` — OAuth callback, sync trigger, settings
- **Settings page additions:** O365 connection status, connect/disconnect buttons
- **Pattern:** Follow the exact same structure as the existing Gmail integration (`src/lib/gmail.ts`) for consistency

---

## Phase 2: Smart Follow-up Engine

**Goal:** Make the AI proactively help the user stay on top of deals and relationships so nothing falls through the cracks.

### 2.1 Stale Deal Detection

- Flag deals with no activity in a configurable period (default: 7 days)
- Severity levels: warm (7 days), cold (14 days), at-risk (21+ days)
- Surface in morning briefing and as proactive suggestions
- New LLM tool: `get_stale_deals` — returns deals needing attention with last activity date and context

### 2.2 Follow-up Reminders

- Analyze email/activity history to detect when follow-ups are due
- Suggest follow-ups based on patterns: "You usually reply to Sarah within 2 days — it's been 5"
- Track follow-up commitments mentioned in emails/notes ("I'll send the proposal by Friday")
- New LLM tool: `get_follow_up_suggestions` — returns prioritized follow-up list with reasoning

### 2.3 Next-Action Suggestions

- Based on deal stage + recent activity, suggest the logical next step
- Stage-appropriate suggestions: lead -> qualify, qualified -> propose, etc.
- Examples: "Deal is in 'proposal' stage but no proposal document attached — time to send one?"
- New LLM tool: `get_next_actions` — returns suggested actions per deal

### 2.4 Email Templates

- Save reusable email templates with merge fields: `{{contact.firstName}}`, `{{deal.name}}`, `{{deal.value}}`
- Template CRUD via conversation ("save this as a template called 'Proposal Follow-up'")
- Apply templates when composing emails
- New DB table: `email_templates` (id, name, subject, body, createdAt, updatedAt)
- New LLM tools: `create_email_template`, `list_email_templates`, `apply_email_template`

### 2.5 Scheduled Sends

- Queue emails/SMS to send at a specific date/time
- "Send this email to John tomorrow at 9am"
- New DB table: `scheduled_messages` (id, type, recipientId, content, scheduledAt, sentAt, status)
- Background check on API route calls to send due messages
- New LLM tool: `schedule_message`

### 2.6 Morning Briefing

- On first interaction of the day, proactively show:
  - Overdue tasks
  - Stale deals needing attention
  - Today's calendar events (from O365 and/or Gmail)
  - Follow-ups due today
  - Key metrics snapshot (deals closing this week, pipeline value)
- Presented as a rich DynamicUI block with sections
- New LLM tool: `get_morning_briefing`

---

## Phase 3: AI Intelligence

**Goal:** Use accumulated interaction data to generate genuine insights about contacts, deals, and sales patterns.

### 3.1 Lead Scoring

- Score contacts 0-100 based on weighted signals:
  - Email interaction frequency (sends, replies, response time)
  - Meeting frequency
  - Deal stage progression speed
  - Recency of last interaction
- Visual indicator on contact cards (hot/warm/cold or numeric score)
- Scoring recalculated on each sync/activity
- New LLM tool: `get_lead_scores` — returns scored contacts with reasoning

### 3.2 Deal Health Indicator

- Traffic-light system per deal: green / yellow / red
- Factors:
  - Days in current stage vs. historical average
  - Activity recency (last email, meeting, note)
  - Email sentiment trends (positive/neutral/negative)
  - Whether typical stage actions are complete
- Surface prominently on pipeline board and deal detail view
- New LLM tool: `get_deal_health` — returns health status with contributing factors

### 3.3 Relationship Strength Mapping

- Map relationship strength per contact: strong / moderate / weak / dormant
- Based on: communication frequency, response rates, meeting cadence, deal involvement
- Highlight contacts whose relationships are weakening
- New LLM tool: `get_relationship_map` — returns relationship strength overview

### 3.4 Win/Loss Pattern Detection

- Analyze closed deals to find patterns:
  - "Deals you win typically have 3+ meetings before proposal stage"
  - "Deals over $50k take 2x longer but have higher win rates"
  - "Deals stalled in negotiation for 10+ days have a 70% loss rate"
- Presented as insights in analytics and proactive suggestions
- New LLM tool: `get_sales_insights` — returns pattern-based insights

### 3.5 Smart Suggestions

- Proactive AI suggestions based on detected patterns:
  - "Contacts at Acme Corp haven't been contacted in 30 days — similar accounts churned"
  - "You have 3 deals closing this week but no follow-up meetings scheduled"
  - "This deal matches the pattern of deals that stall — consider escalating"
- Integrated into conversation flow and morning briefing

---

## Phase 4: Analytics & Reporting

**Goal:** Provide historical trend analysis and forecasting so the user understands their business trajectory.

### 4.1 Pipeline Trends Over Time

- Weekly/monthly snapshots of pipeline value by stage
- Historical chart showing pipeline growth or contraction
- New DB table: `pipeline_snapshots` (id, date, stage, dealCount, totalValue)
- Background job to capture daily snapshots (triggered on first daily API call)
- New LLM tool: `get_pipeline_trends` — returns trend data for DynamicUI charting

### 4.2 Revenue Forecast

- Weighted pipeline forecast: `deal.value * deal.probability` by close date
- Monthly/quarterly forecast view
- Comparison: forecast vs. actual closed revenue
- New LLM tool: `get_revenue_forecast` — returns forecast by time period

### 4.3 Sales Velocity Metrics

- Average days per pipeline stage
- Deal cycle time (lead to close)
- Conversion rates between stages
- Velocity trend over time
- New LLM tool: `get_sales_velocity` — returns velocity metrics

### 4.4 Win/Loss Analysis

- Breakdown by: company size, deal value range, time period
- Win rate trends over time
- Common reasons for loss (if tracked in notes/activities)
- New LLM tool: `get_win_loss_analysis` — returns analysis breakdown

### 4.5 Activity Reports

- Communication volume trends (emails sent/received, calls, meetings per week)
- Response time averages
- Most active contacts/deals
- New LLM tool: `get_activity_trends` — returns activity analytics

### 4.6 Date Range Filtering

- All reports/analytics support arbitrary date ranges
- Preset ranges: this week, this month, this quarter, last 30/60/90 days, custom
- Passed as parameters to all analytics LLM tools

### 4.7 Report Export

- Export any report/chart as PDF or CSV via conversation
- "Export my pipeline forecast for Q2 as a PDF"
- New LLM tool: `export_report` — generates downloadable report file

---

## Cross-Cutting Concerns

### DynamicUI Extensions

All new features render through the existing DynamicUI system. New block types or compositions needed:

- **Chart blocks** — line/bar/area charts for trends and forecasts (lightweight charting library)
- **Score indicators** — lead score / deal health visual badges
- **Briefing composite** — morning briefing with multiple sections
- **Template editor** — email template creation/editing form
- **Calendar view** — upcoming events display

### New Database Tables (additive, auto-create via IF NOT EXISTS)

| Table | Phase | Purpose |
|-------|-------|---------|
| `email_templates` | 2 | Reusable email templates with merge fields |
| `scheduled_messages` | 2 | Queued future email/SMS sends |
| `pipeline_snapshots` | 4 | Daily pipeline state captures for trend analysis |

(O365 tokens stored in existing settings table, matching Gmail pattern)

### New LLM Tools Summary

| Phase | Tools |
|-------|-------|
| 1 | `send_outlook_email`, `get_outlook_inbox`, `get_outlook_thread`, `get_calendar_events`, `create_calendar_event`, `import_outlook_contacts` |
| 2 | `get_stale_deals`, `get_follow_up_suggestions`, `get_next_actions`, `create_email_template`, `list_email_templates`, `apply_email_template`, `schedule_message`, `get_morning_briefing` |
| 3 | `get_lead_scores`, `get_deal_health`, `get_relationship_map`, `get_sales_insights` |
| 4 | `get_pipeline_trends`, `get_revenue_forecast`, `get_sales_velocity`, `get_win_loss_analysis`, `get_activity_trends`, `export_report` |

**Total: 24 new LLM tools across 4 phases**

### Conversation-First Design Principle

Every feature must be accessible through natural language conversation. No feature requires navigating to a dedicated page. The LLM tools are the primary interface; rich UI blocks are the display layer.

---

## Verification Strategy

For each phase:

1. **Manual testing** via conversation — exercise every new LLM tool through natural language prompts
2. **Integration testing** — verify OAuth flows, API calls, data sync correctness
3. **Data integrity** — confirm synced data matches source, no duplicates introduced
4. **UI verification** — rich blocks render correctly in conversation panel
5. **Edge cases** — empty states, API failures, token expiry, rate limits, missing data
