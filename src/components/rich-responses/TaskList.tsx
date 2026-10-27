"use client";

import { useState } from "react";
import type { TaskListData } from "@/types/conversation";
import type { Task } from "@/types/crm";
import { CheckCircle2, Circle, AlertTriangle, Clock, User, Briefcase } from "lucide-react";

interface Props {
  data: TaskListData;
}

const PRIORITY_DOTS: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-blue-400",
};

export function TaskList({ data }: Props) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const today = new Date().toISOString().split("T")[0];

  const overdue = data.tasks.filter(t => t.status === "pending" && t.dueDate < today && !completedIds.has(t.id));
  const dueToday = data.tasks.filter(t => t.status === "pending" && t.dueDate === today && !completedIds.has(t.id));
  const upcoming = data.tasks.filter(t => t.status === "pending" && t.dueDate > today && !completedIds.has(t.id));
  const completed = data.tasks.filter(t => t.status === "completed" || completedIds.has(t.id));

  async function handleComplete(taskId: string) {
    setCompletedIds(prev => new Set(prev).add(taskId));
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
    } catch {
      setCompletedIds(prev => { const next = new Set(prev); next.delete(taskId); return next; });
    }
  }

  return (
    <div className="my-4 space-y-3">
      {data.title && (
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-[13px] font-semibold text-foreground">{data.title}</h3>
          {data.overdueCount !== undefined && data.overdueCount > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">{data.overdueCount} overdue</span>
          )}
        </div>
      )}

      {overdue.length > 0 && (
        <TaskGroup label="Overdue" icon={<AlertTriangle className="w-3 h-3" />} color="red" tasks={overdue} onComplete={handleComplete} />
      )}
      {dueToday.length > 0 && (
        <TaskGroup label="Today" icon={<Clock className="w-3 h-3" />} color="amber" tasks={dueToday} onComplete={handleComplete} />
      )}
      {upcoming.length > 0 && (
        <TaskGroup label="Upcoming" icon={<Clock className="w-3 h-3" />} color="blue" tasks={upcoming} onComplete={handleComplete} />
      )}
      {completed.length > 0 && (
        <TaskGroup label="Completed" icon={<CheckCircle2 className="w-3 h-3" />} color="emerald" tasks={completed} onComplete={handleComplete} isCompleted />
      )}

      {data.tasks.length === 0 && (
        <p className="text-[13px] text-muted-foreground/60 text-center py-4">No tasks found</p>
      )}
    </div>
  );
}

function TaskGroup({ label, icon, color, tasks, onComplete, isCompleted }: {
  label: string;
  icon: React.ReactNode;
  color: string;
  tasks: Task[];
  onComplete: (id: string) => void;
  isCompleted?: boolean;
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    red: { bg: "bg-red-50/80 dark:bg-red-950/30", text: "text-red-700 dark:text-red-400", border: "border-red-200/60 dark:border-red-800/30" },
    amber: { bg: "bg-amber-50/80 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200/60 dark:border-amber-800/30" },
    blue: { bg: "bg-blue-50/80 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-400", border: "border-blue-200/60 dark:border-blue-800/30" },
    emerald: { bg: "bg-emerald-50/80 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200/60 dark:border-emerald-800/30" },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-1.5 ${c.text}`}>
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
        <span className="text-[10px] opacity-60">({tasks.length})</span>
      </div>
      <div className="space-y-1">
        {tasks.map(task => (
          <div
            key={task.id}
            className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border ${c.border} ${c.bg} transition-all ${isCompleted ? "opacity-60" : ""}`}
          >
            <button
              onClick={() => !isCompleted && onComplete(task.id)}
              className={`mt-0.5 flex-shrink-0 transition-colors ${isCompleted ? "text-emerald-500" : "text-muted-foreground/40 hover:text-primary"}`}
              disabled={isCompleted}
            >
              {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOTS[task.priority] || PRIORITY_DOTS.medium}`} />
                <span className={`text-[13px] font-medium ${isCompleted ? "line-through text-muted-foreground" : "text-foreground/90"}`}>
                  {task.title}
                </span>
              </div>
              {task.description && (
                <p className="text-[11px] text-muted-foreground/70 mt-0.5 ml-3.5">{task.description}</p>
              )}
              <div className="flex items-center gap-3 mt-1 ml-3.5">
                {task.contactName && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60">
                    <User className="w-2.5 h-2.5" /> {task.contactName}
                  </span>
                )}
                {task.dealName && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60">
                    <Briefcase className="w-2.5 h-2.5" /> {task.dealName}
                  </span>
                )}
                {task.dueTime && (
                  <span className="text-[10px] text-muted-foreground/60">{task.dueTime}</span>
                )}
                {!isCompleted && (
                  <span className="text-[10px] text-muted-foreground/50">
                    {formatDueLabel(task.dueDate)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDueLabel(dueDate: string): string {
  const today = new Date().toISOString().split("T")[0];
  if (dueDate === today) return "Today";
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  if (dueDate === tomorrow) return "Tomorrow";
  const due = new Date(dueDate + "T00:00:00");
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
