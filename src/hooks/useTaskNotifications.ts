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

          const timePart = task.dueTime ? ` at ${task.dueTime}` : "";
          const contextPart = task.contactName ? ` — ${task.contactName}` : task.dealName ? ` — ${task.dealName}` : "";
          const body = `Due: ${task.dueDate}${timePart}${contextPart}`;
          const priorityLabel = task.priority === "high" ? "HIGH: " : "";

          new Notification(`${priorityLabel}${task.title}`, {
            body,
            tag: `task-${task.id}`,
            requireInteraction: task.priority === "high",
          });

          fetch("/api/tasks/due-reminders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: task.id }),
          }).catch(() => {});
        }
      } catch {
        // Silently fail
      }
    }

    checkReminders();
    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, []);
}
