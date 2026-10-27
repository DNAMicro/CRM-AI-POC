# Task Reminder Notifications — Design Spec

**Date:** 2026-04-10
**Scope:** Add browser desktop notifications for task reminders with configurable per-task timing

---

## Overview

Tasks have due dates and times but no alerting mechanism. When a task comes due, the user only knows if they happen to look at the badge in the sidebar. This feature adds browser desktop notifications that fire at a configurable time before each task is due.

## Database Changes

Add 2 columns to the `tasks` table (additive, via `safeAddColumn`):

- `reminderMinutes INTEGER` — null = no reminder, 0 = at due time, 5/15/30/60 = minutes before
- `reminderFiredAt TEXT` — ISO timestamp of when reminder was fired, null = not yet fired

## Notification Hook

New `src/hooks/useTaskNotifications.ts`:

1. On mount, request `Notification.permission` if not already granted
2. Poll `GET /api/tasks/due-reminders` every 30 seconds
3. For each returned task, fire `new Notification(title, { body, icon })`
4. POST `PATCH /api/tasks/[id]` to set `reminderFiredAt` (prevents re-firing)
5. Missed reminders (app was closed) fire immediately on next poll

## API Endpoint

`GET /api/tasks/due-reminders` — returns tasks where:
- `status = 'pending'`
- `reminderMinutes IS NOT NULL`
- `reminderFiredAt IS NULL`
- Current time >= `(dueDate + dueTime) - reminderMinutes`

## LLM Integration

- Update `create_task` tool to accept `reminder_minutes` parameter (default: 15)
- Update system prompt: "When creating tasks with specific times, default to a 15-minute reminder. Ask the user if they want a different reminder interval."
- Reminder options exposed to the LLM: none, at due time (0), 5 min, 15 min, 30 min, 1 hour

## Files

| File | Change |
|------|--------|
| `src/lib/db.ts` | Add columns + `getTasksDueForReminder()` + update `insertTask` |
| `src/hooks/useTaskNotifications.ts` | New: polling hook + Notification API |
| `src/app/api/tasks/due-reminders/route.ts` | New: endpoint for due reminders |
| `src/components/layout/AppShell.tsx` | Mount `useTaskNotifications` |
| `src/lib/llm/tools.ts` | Add `reminder_minutes` param to `create_task` |
| `src/lib/llm/tool-executor.ts` | Pass `reminderMinutes` to `insertTask` |
| `src/lib/llm/system-prompt.ts` | Add reminder rule |
