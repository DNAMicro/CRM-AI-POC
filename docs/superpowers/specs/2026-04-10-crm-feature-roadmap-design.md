# CRM Feature Roadmap: Prototype to Usable CRM

**Date:** 2026-04-10
**Author:** Farsheed + Claude
**Status:** Design approved

## Context

The CRM AI app is a conversational CRM prototype with a strong foundation: 24 LLM tools, full contact/deal CRUD, pipeline board, Gmail/SMS integration, activity logging, dynamic UI charts, and a glass-morphism design system.

The goal is to turn it into a daily-driver CRM for a solo founder/salesperson. The key principle: every feature should work WITH the conversational AI interface, not replace it with traditional CRUD pages.

## Design Decisions

- **Use case:** Solo founder/sales — single user, no collaboration needed, but architecture should not preclude multi-user later
- **Task UX:** Hybrid — sidebar widget for at-a-glance daily tasks + AI conversation for creation/management
- **Conversations:** Single continuous thread with "New chat" button, history in sidebar
- **Reports:** Generated entirely through conversation using existing DynamicUI — no dedicated reports page
- **Phase ordering:** Foundation -> Tasks -> Search -> Pipeline/Reports -> Polish

---

## Phase 1: Fix the Foundation

**Goal:** Make the app stable, trustworthy, and not lose data.

### 1A. Error Boundaries

Add React error boundaries around:
- Each of the three layout zones (LeftSidebar, ConversationPanel, RightDetailPanel) in `AppShell.tsx`
- Individual rich block renders in `MessageBubble.tsx`
- The chat API route with error classification (LLM error vs. tool error vs. network)

**What it looks like:** A malformed rich block shows "This block could not be displayed" with a collapse/retry option instead of crashing the page. An LLM failure shows a clear error with retry button.

**Files to create/modify:**
- NEW: `src/components/ErrorBoundary.tsx`
- MODIFY: `src/components/layout/AppShell.tsx` — wrap zones
- MODIFY: `src/components/conversation/MessageBubble.tsx` — wrap each RichBlock render

### 1B. Schema Consolidation

The schema is defined in 3 places that can drift: SQL DDL in `db.ts`, TypeScript types in `types/crm.ts`, and the schema string in `tools.ts` `run_custom_query` description. Static data files also have duplicate query helpers.

**Fix:**
- Make `types/crm.ts` the canonical source
- Generate the `run_custom_query` schema description from the actual DB schema at runtime (query `sqlite_master`)
- Remove duplicate query functions from `src/data/*.ts` (keep only seed arrays)
- Add a startup validation that checks TS types match DB columns

**Files to modify:**
- `src/lib/db.ts` — schema init
- `src/lib/llm/tools.ts` — dynamic schema description for `run_custom_query`
- `src/data/contacts.ts`, `src/data/deals.ts`, `src/data/activities.ts` — remove query helpers
- `src/types/crm.ts` — ensure types are canonical

### 1C. User Profile

Replace hardcoded "Farsheed" with a settings-stored user profile.

**New settings keys:** `user_name`, `user_role` (optional, e.g., "sales", "founder")

**Files to modify:**
- `src/lib/llm/system-prompt.ts` — read user name from settings dynamically
- `src/lib/api-client.ts` — `buildGreetingFromStats()` uses stored name
- `src/app/settings/page.tsx` — add "Profile" section with name field

### 1D. Conversation Persistence

Store conversations in SQLite. Single continuous thread model.

**New tables:**
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New conversation',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY,
  conversationId TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  richBlocks TEXT DEFAULT '[]',      -- JSON
  suggestedChips TEXT DEFAULT '[]',  -- JSON
  attachments TEXT DEFAULT '[]',     -- JSON
  debugToolCalls TEXT DEFAULT '[]',  -- JSON
  timestamp TEXT NOT NULL
);
```

**New API routes:**
- `GET /api/conversations` — list conversations
- `POST /api/conversations` — create new conversation
- `GET /api/conversations/[id]` — get conversation with messages
- `POST /api/conversations/[id]/messages` — add message to conversation

**UI changes:**
- `useConversation.ts` — persist messages to DB on each add, load latest on startup
- `LeftSidebar.tsx` — add conversation list section with "New chat" button
- `ConversationPanel.tsx` — load/switch conversations

---

## Phase 2: Tasks & Daily Workflow

**Goal:** Answer "What should I do next?" — the #1 feature that makes a CRM useful daily.

### 2A. Tasks Table + CRUD

**New table:**
```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  dueDate TEXT NOT NULL,           -- YYYY-MM-DD
  dueTime TEXT,                     -- HH:MM (nullable)
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
  contactId TEXT REFERENCES contacts(id),
  dealId TEXT REFERENCES deals(id),
  completedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
```

Tasks are separate from activities. Activities = historical records ("I called Sarah"). Tasks = forward-looking intentions ("Call Sarah Thursday").

**New API routes:**
- `GET /api/tasks` — with filters: `status`, `dueDate`, `contactId`, `dealId`, `priority`
- `POST /api/tasks` — create task
- `PUT /api/tasks/[id]` — update task
- `DELETE /api/tasks/[id]` — delete task

### 2B. LLM Task Tools

Three new tools:
- `create_task(title, due_date, due_time?, priority?, contact_id?, deal_id?, description?)` — natural language: "Remind me to call Sarah on Thursday"
- `get_tasks(status?, due_date?, contact_id?, deal_id?, include_overdue?)` — "What's due today?" "Show my overdue tasks"
- `complete_task(task_id, log_activity?)` — "Mark the Sarah follow-up as done" — optionally logs as activity

System prompt updates:
- After logging activities, suggest follow-up tasks
- After deal stage changes, suggest next-step tasks
- Include task counts in available context

### 2C. Task UI Components

**New rich block type:** `task-list`

**New component:** `src/components/rich-responses/TaskList.tsx`
- Renders tasks grouped by: overdue, today, upcoming
- Each row: checkbox, priority dot, title, linked contact/deal name, due date
- Checkbox click completes task inline (POST to API)
- Color-coded: red (overdue), amber (today), blue (upcoming), gray (completed)

### 2D. Sidebar Task Widget

In `LeftSidebar.tsx`, replace/augment the "Follow-ups" nav item with an always-visible task widget:
- Shows today's tasks with checkboxes
- Badge count on the widget header (overdue count in red)
- Checkbox completion calls API directly (no conversation needed)
- Compact: max 5 visible, "Show all" expands or triggers conversation

### 2E. Smart Greeting

Enhance `buildGreetingFromStats()` and `/api/stats`:
- Add task counts to stats: `overdueTaskCount`, `dueTodayTaskCount`
- Greeting includes: "You have X overdue tasks and Y due today"
- Rich block: TaskList with today's tasks below the greeting
- Suggested chips: "Show overdue tasks", "Add a new task", "Show pipeline"

---

## Phase 3: Search & Data Management

**Goal:** Find things fast as data grows. Get data in and out.

### 3A. Global Search Tool

New LLM tool: `global_search(query, entity_types?)`

Searches across contacts (name, company, email), deals (name, company), activities (description), tasks (title, description), emails (subject, body), and SMS (body).

Returns a unified `search-results` rich block with type badges per result.

Implementation: `searchAll(query)` in `db.ts` using LIKE queries. For scale, can upgrade to SQLite FTS5 later.

### 3B. @Mention Autocomplete

When user types `@` in `MessageInput.tsx`, show a dropdown of contacts/deals matching the typed text.

New API: `GET /api/search/typeahead?q=sar&type=contact` — returns top 5 matches.

Selecting a mention inserts the entity name and passes the ID as context to the LLM.

### 3C. CSV Import/Export

Two new LLM tools:
- `import_contacts(file_id)` — parses uploaded CSV (file upload already exists), maps columns, creates contacts. Shows preview table with "Confirm import" button.
- `export_contacts(filter?)` — generates CSV, returns download link

### 3D. Bulk Operations

New LLM tool: `bulk_update(entity_type, filter, updates)` or `bulk_delete(entity_type, filter)`

Requires confirmation: returns a preview of affected records with "Confirm" button before executing.

---

## Phase 4: Pipeline Power & Reports

**Goal:** Pipeline management and business insights.

### 4A. Pipeline Drag-and-Drop

Modify `PipelineBoard.tsx` to support drag-and-drop using native HTML5 DnD (or dnd-kit if needed for React 19 compat).

Drop = `PUT /api/deals/[id]` with new stage. Activity logged automatically by existing `updateDeal()`.

### 4B. AI-Generated Reports

Three new LLM tools that compose existing DynamicUI:
- `generate_pipeline_report()` — funnel chart, weighted forecast, win rate, avg cycle time
- `generate_activity_report(period?)` — activity volume by type, most active contacts
- `generate_revenue_report(period?)` — won deals by month, trend, avg deal size

No new UI components — these use `generate_dynamic_ui` with chart nodes.

### 4C. Deal Audit Trail

Enhance `updateDeal()` in `db.ts` to log all field changes (not just stage changes). Each change logged as activity with metadata describing old/new values.

Enhance `ActivityTimeline.tsx` to render field-change activities with a diff view.

### 4D. Task Notifications

- Sidebar badge: pending task count (red if overdue)
- Browser Notification API: permission request, fire for overdue tasks
- Stats poll (already 60s interval) includes task counts

---

## Phase 5: Polish & Extensibility

**Goal:** From usable to delightful.

### 5A. Dark Mode
CSS variable theme toggle. Glass-morphism looks great dark. Toggle in sidebar footer, preference in localStorage.

### 5B. Mobile Responsive
Three-column → single column on mobile. Hamburger menu for sidebars. Touch gestures for panel switching.

### 5C. Conversation History
Sidebar list of past conversations (from Phase 1D tables). Click to load. Search conversations.

### 5D. Tag Management
Tag autocomplete in forms. Browse all tags. Filter contacts by tag via conversation.

### 5E. Test Infrastructure
Vitest setup. API route tests. DB function unit tests. One E2E test for chat → rich block flow.

### 5F. Rich Notes
Markdown notes linked to contacts/deals. New `notes` table, LLM tool, rich block.

---

## Technical Approach

### New Database Tables (additive, auto-create via IF NOT EXISTS)
1. `conversations` — Phase 1D
2. `conversation_messages` — Phase 1D
3. `tasks` — Phase 2A

### New LLM Tools (added to tools.ts and tool-executor.ts)
1. `create_task` — Phase 2B
2. `get_tasks` — Phase 2B
3. `complete_task` — Phase 2B
4. `global_search` — Phase 3A
5. `import_contacts` — Phase 3C
6. `export_contacts` — Phase 3C
7. `bulk_update` — Phase 3D
8. `generate_pipeline_report` — Phase 4B
9. `generate_activity_report` — Phase 4B
10. `generate_revenue_report` — Phase 4B

### New UI Components
1. `ErrorBoundary.tsx` — Phase 1A
2. `TaskList.tsx` (rich block) — Phase 2C
3. Sidebar task widget (in LeftSidebar) — Phase 2D
4. Conversation list (in LeftSidebar) — Phase 1D/5C
5. @Mention autocomplete — Phase 3B
6. SearchResults rich block — Phase 3A

### Key Architectural Principle
Reports and analytics are generated through conversation using existing DynamicUI, not as separate pages. This keeps the conversational AI as the primary interface and avoids building a parallel traditional CRM UI.
