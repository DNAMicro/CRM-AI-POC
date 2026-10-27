# Sidebar Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conversation rename/delete UI, auto-generate conversation titles, tighten sidebar spacing, and fix date display to use proper timezone conversion.

**Architecture:** 4 independent changes to existing files. No new modules. Context menu uses a simple dropdown state. Auto-titles generated via a lightweight LLM call after first assistant response. Spacing adjustments are CSS-only. Date fix uses a shared `formatDateTime` utility.

**Tech Stack:** React, Tailwind CSS, existing API routes, existing LLM pipeline

---

## Task 1: Date Formatting Utility

**Files:** Modify `src/lib/format.ts`

Add a `formatDateTime` function that properly formats ISO strings with both date and time using `toLocaleString` (not `toLocaleDateString` which ignores time options):

```typescript
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
```

Fix the sidebar date display in `src/components/layout/LeftSidebar.tsx` line 128 — replace the inline `toLocaleDateString` with the new `formatDateTime`:

```typescript
// OLD (broken):
{new Date(conv.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}

// NEW:
{formatDateTime(conv.updatedAt)}
```

Import `formatDateTime` at the top of LeftSidebar.tsx.

Commit: `fix: add formatDateTime utility and fix sidebar date display`

---

## Task 2: Conversation Context Menu (Rename + Delete)

**Files:** Modify `src/components/layout/LeftSidebar.tsx`, Modify `src/hooks/useConversation.ts`

### In useConversation.ts:

Add two new actions to the `ConversationActions` interface:

```typescript
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
```

Implement them in `useConversationReducer`:

```typescript
const renameConversation = useCallback(async (id: string, title: string) => {
  await fetch(`/api/conversations/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  refreshConversations();
}, [refreshConversations]);

const deleteConversation = useCallback(async (id: string) => {
  await fetch(`/api/conversations/${id}`, { method: "DELETE" });
  if (conversationIdRef.current === id) {
    // Deleted the active conversation — start a new one
    newConversation();
  }
  refreshConversations();
}, [newConversation, refreshConversations]);
```

Add both to the returned actions object and the context default.

### In LeftSidebar.tsx:

Add `renameConversation` and `deleteConversation` to the destructured actions. Add state for the context menu and inline rename:

```typescript
const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
const [renamingId, setRenamingId] = useState<string | null>(null);
const [renameValue, setRenameValue] = useState("");
```

Replace the conversation list item button with one that includes a "..." menu trigger and an inline rename input:

For each conversation item:
- If `renamingId === conv.id`: show an `<input>` with the current title, Enter saves via `renameConversation(conv.id, renameValue)`, Escape cancels
- Otherwise: show the title + a "..." button on hover that opens a small dropdown with "Rename" and "Delete" options
- "Rename" sets `renamingId` and `renameValue`
- "Delete" calls `deleteConversation(conv.id)` (with a `confirm()` dialog)

The "..." button and dropdown use existing glass-surface styling. Import `MoreHorizontal, Pencil, Trash2` from lucide-react.

Commit: `feat: add conversation rename and delete to sidebar`

---

## Task 3: Auto-Generate Conversation Titles

**Files:** Modify `src/hooks/useConversation.ts`

In the `callLLM` function, after the assistant message is dispatched and persisted, check if this is the first user message in the conversation (messages length <= 2: greeting + first user message). If so, fire-and-forget an LLM call to generate a title:

```typescript
// Auto-title: after first user+assistant exchange, generate a title
const currentMessages = messagesRef.current;
if (currentMessages.length <= 3 && conversationIdRef.current) {
  const firstUserMsg = currentMessages.find(m => m.role === "user");
  if (firstUserMsg) {
    generateConversationTitle(conversationIdRef.current, firstUserMsg.content);
  }
}
```

Add the `generateConversationTitle` function:

```typescript
const generateConversationTitle = useCallback(async (convId: string, userMessage: string) => {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Generate a short conversation title (3-5 words, no quotes) for this message: "${userMessage}"`,
        history: [],
        generateTitleOnly: true,
      }),
    });
    const data = await res.json();
    const title = (data.content || "").replace(/["']/g, "").trim().slice(0, 50);
    if (title && title.length > 2) {
      await fetch(`/api/conversations/${convId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      refreshConversations();
    }
  } catch {
    // Silently fail — title stays as default
  }
}, [refreshConversations]);
```

The chat API route doesn't need changes — it already handles any message. The `generateTitleOnly` flag is informational only (could be used later to skip tool calls). The LLM will return a short title in `data.content`.

Commit: `feat: auto-generate conversation titles from first message`

---

## Task 4: Tighten Sidebar Spacing

**Files:** Modify `src/components/layout/LeftSidebar.tsx`

Reduce padding and spacing throughout:

| Element | Old | New |
|---------|-----|-----|
| Branding container | `px-5 py-5` | `px-4 py-3.5` |
| Quick Stats section | `px-4 py-4` | `px-4 py-3` |
| Navigation section | `px-4 py-4` | `px-4 py-2.5` |
| Nav items | `px-3 py-2.5` | `px-3 py-1.5` |
| Conversations container | `px-4 py-4 space-y-4` | `px-4 py-2.5 space-y-3` |
| New Chat button | `px-3 py-2.5` | `px-3 py-2` |
| Conversation items | `px-3 py-2` | `px-3 py-1.5` |
| Pinned deals items | `px-3 py-2.5` | `px-3 py-1.5` |
| Pinned deals section | `space-y-1` | `space-y-0.5` |
| Footer | `px-4 py-3` | `px-4 py-2` |

Also reduce the sidebar width slightly: `w-[280px]` → `w-[260px]`

Commit: `fix: tighten sidebar spacing for professional appearance`

---

## Task 5: Verification

Build check + visual inspection of sidebar.

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Date formatting fix | `format.ts`, `LeftSidebar.tsx` |
| 2 | Context menu (rename/delete) | `LeftSidebar.tsx`, `useConversation.ts` |
| 3 | Auto-title generation | `useConversation.ts` |
| 4 | Sidebar spacing | `LeftSidebar.tsx` |
| 5 | Verification | — |
