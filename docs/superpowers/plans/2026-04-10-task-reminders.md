# Task Reminder Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser desktop notifications for task reminders with configurable per-task timing (at due time, 5/15/30/60 minutes before).

**Architecture:** Add `reminderMinutes` and `reminderFiredAt` columns to tasks table. New `useTaskNotifications` hook polls every 30s for due reminders, fires browser Notification API, marks as fired. New API endpoint returns tasks due for reminder. Update `create_task` LLM tool to accept reminder parameter.

**Tech Stack:** Browser Notification API, React hook with setInterval, Next.js API route, SQLite

---

## Task 1: Database Changes

**Files:** Modify `src/lib/db.ts`

- [ ] **Step 1: Add reminder columns to tasks table**

In `initSchema`, after the existing `safeAddColumn` calls for emails, add:

```typescript
  safeAddColumn(db, "tasks", "reminderMinutes", "INTEGER");
  safeAddColumn(db, "tasks", "reminderFiredAt", "TEXT");
```

- [ ] **Step 2: Update insertTask to accept reminderMinutes**

Find `insertTask` (line ~1205). Update the data parameter type:

```typescript
export function insertTask(data: {
  title: string; description?: string; dueDate: string; dueTime?: string;
  priority?: string; contactId?: string; dealId?: string; reminderMinutes?: number;
}): Task {
```

Update the INSERT SQL to include the new column:

```sql
    INSERT INTO tasks (id, title, description, dueDate, dueTime, status, priority, contactId, dealId, reminderMinutes, createdAt, updatedAt)
    VALUES (@id, @title, @description, @dueDate, @dueTime, 'pending', @priority, @contactId, @dealId, @reminderMinutes, @createdAt, @updatedAt)
```

And add `reminderMinutes: data.reminderMinutes ?? null` to the run params.

- [ ] **Step 3: Add getTasksDueForReminder query**

Add after the existing task queries:

```typescript
export function getTasksDueForReminder(): Task[] {
  const db = getDb();
  const now = new Date();
  const currentDate = now.toISOString().split("T")[0];
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM

  // Get pending tasks with reminders that haven't fired yet
  const tasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'pending'
      AND reminderMinutes IS NOT NULL
      AND reminderFiredAt IS NULL
      AND dueDate IS NOT NULL
  `).all() as (Task & { reminderMinutes: number })[];

  return tasks.filter(task => {
    const dueDateTime = new Date(`${task.dueDate}T${task.dueTime || "09:00"}:00`);
    const reminderTime = new Date(dueDateTime.getTime() - (task.reminderMinutes || 0) * 60 * 1000);
    return now >= reminderTime;
  });
}

export function markReminderFired(taskId: string): void {
  getDb().prepare("UPDATE tasks SET reminderFiredAt = ? WHERE id = ?").run(new Date().toISOString(), taskId);
}
```

- [ ] **Step 4: Update Task type**

In `src/types/crm.ts`, add to the Task interface:

```typescript
  reminderMinutes: number | null;
  reminderFiredAt: string | null;
```

- [ ] **Step 5: Verify build and commit**

```bash
npm run build 2>&1 | tail -10
git add src/lib/db.ts src/types/crm.ts
git commit -m "feat(reminders): add reminderMinutes/reminderFiredAt columns and reminder query"
```

---

## Task 2: Due Reminders API Endpoint

**Files:** Create `src/app/api/tasks/due-reminders/route.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
import { NextResponse } from "next/server";
import { getTasksDueForReminder, markReminderFired } from "@/lib/db";

export async function GET() {
  const tasks = getTasksDueForReminder();
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const { taskId } = await request.json();
  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }
  markReminderFired(taskId);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/tasks/due-reminders/
git commit -m "feat(reminders): add due-reminders API endpoint"
```

---

## Task 3: Notification Hook

**Files:** Create `src/hooks/useTaskNotifications.ts`, Modify `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Create the notification hook**

Create `src/hooks/useTaskNotifications.ts`:

```typescript
"use client";

import { useEffect, useRef } from "react";

interface ReminderTask {
  id: string;
  title: string;
  dueDate: string;
  dueTime: string | null;
  contactName?: string;
  dealName?: string;
  priority: string;
}

export function useTaskNotifications() {
  const firedIds = useRef(new Set<string>());

  useEffect(() => {
    // Request notification permission on mount
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    async function checkReminders() {
      if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
        return;
      }

      try {
        const res = await fetch("/api/tasks/due-reminders");
        if (!res.ok) return;
        const { tasks } = await res.json() as { tasks: ReminderTask[] };

        for (const task of tasks) {
          if (firedIds.current.has(task.id)) continue;
          firedIds.current.add(task.id);

          // Build notification body
          const timePart = task.dueTime ? ` at ${task.dueTime}` : "";
          const contextPart = task.contactName ? ` — ${task.contactName}` : task.dealName ? ` — ${task.dealName}` : "";
          const body = `Due: ${task.dueDate}${timePart}${contextPart}`;

          const priorityLabel = task.priority === "high" ? "HIGH: " : "";

          new Notification(`${priorityLabel}${task.title}`, {
            body,
            tag: `task-${task.id}`,
            requireInteraction: task.priority === "high",
          });

          // Mark as fired on server
          fetch("/api/tasks/due-reminders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: task.id }),
          }).catch(() => {});
        }
      } catch {
        // Silently fail — next poll will retry
      }
    }

    // Initial check
    checkReminders();

    // Poll every 30 seconds
    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, []);
}
```

- [ ] **Step 2: Mount the hook in AppShell**

In `src/components/layout/AppShell.tsx`, add the import:

```typescript
import { useTaskNotifications } from "@/hooks/useTaskNotifications";
```

Inside the `AppShell` component, after the existing state hooks (`useState`, `useConversationReducer`, etc.), add:

```typescript
  useTaskNotifications();
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTaskNotifications.ts src/components/layout/AppShell.tsx
git commit -m "feat(reminders): add useTaskNotifications hook with browser Notification API"
```

---

## Task 4: LLM Tool Updates

**Files:** Modify `src/lib/llm/tools.ts`, `src/lib/llm/tool-executor.ts`, `src/lib/llm/system-prompt.ts`

- [ ] **Step 1: Add reminder_minutes param to create_task tool**

In `tools.ts`, find the `create_task` tool definition. Add this property after `deal_id`:

```typescript
          reminder_minutes: { type: "number", enum: [0, 5, 15, 30, 60], description: "Minutes before due time to send a browser notification. 0 = at due time, 15 = 15 min before. Default: 15 for tasks with a specific time, null for date-only tasks." },
```

- [ ] **Step 2: Update execCreateTask to pass reminderMinutes**

In `tool-executor.ts`, find `execCreateTask` (line ~1029). Update the `db.insertTask` call to include `reminderMinutes`:

```typescript
  const task = db.insertTask({
    title: String(args.title),
    description: args.description ? String(args.description) : undefined,
    dueDate: String(args.due_date),
    dueTime: args.due_time ? String(args.due_time) : undefined,
    priority: args.priority ? String(args.priority) : undefined,
    contactId,
    dealId: args.deal_id ? String(args.deal_id) : undefined,
    reminderMinutes: args.reminder_minutes !== undefined ? Number(args.reminder_minutes) : (args.due_time ? 15 : undefined),
  });
```

Note: If a `due_time` is provided but no explicit `reminder_minutes`, default to 15 minutes.

- [ ] **Step 3: Add system prompt rule**

In `system-prompt.ts`, after rule 41 (REPORT EXPORT), add:

```
42. For TASK REMINDERS: When creating tasks with a specific due time, default to a 15-minute reminder (reminder_minutes=15). If the user says "remind me at 3pm", set due_time="15:00" and reminder_minutes=15. Available reminder options: at due time (0), 5 min, 15 min, 30 min, 1 hour (60). For date-only tasks without a time, don't set a reminder unless the user asks for one.
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/llm/tools.ts src/lib/llm/tool-executor.ts src/lib/llm/system-prompt.ts
git commit -m "feat(reminders): update create_task tool with reminder_minutes param"
```

---

## Task 5: Verification

- [ ] **Step 1: Build check**

Run: `npm run build 2>&1 | tail -10`

- [ ] **Step 2: Test reminder creation via chat**

Chat: "remind me to call Sarah tomorrow at 3pm"
Expected: Task created with dueTime=15:00 and reminderMinutes=15

- [ ] **Step 3: Test notification permission**

Open app, check browser notification permission prompt appears.

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | DB columns + query | `src/lib/db.ts`, `src/types/crm.ts` |
| 2 | API endpoint | `src/app/api/tasks/due-reminders/route.ts` (new) |
| 3 | Notification hook | `src/hooks/useTaskNotifications.ts` (new), `AppShell.tsx` |
| 4 | LLM tool updates | `tools.ts`, `tool-executor.ts`, `system-prompt.ts` |
| 5 | Verification | All files |

**Total: 2 new files, 5 modified files, 4 commits**
