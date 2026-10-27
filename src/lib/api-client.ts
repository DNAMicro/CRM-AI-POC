import type { RichBlock, ChipAction, StatCard, FileAttachment } from "@/types/conversation";
import type { Contact, Deal, Activity, Task } from "@/types/crm";
import { formatCurrency } from "@/lib/format";

// ===== Dashboard Stats =====

export interface DashboardStats {
  activeDealsCount: number;
  pipelineValue: number;
  closingThisMonthCount: number;
  closingThisMonthValue: number;
  activeContactsCount: number;
  followUpsNeededCount: number;
  weightedPipelineValue: number;
  pinnedDeals: Deal[];
  unreadEmailCount?: number;
  unreadSmsCount?: number;
  userName?: string;
  overdueCount?: number;
  dueTodayCount?: number;
  pendingCount?: number;
  overdueTasks?: Task[];
  todayTasks?: Task[];
  staleDealsCount?: number;
  followUpSuggestionsCount?: number;
}

export async function fetchStats(): Promise<DashboardStats> {
  const res = await fetch("/api/stats");
  return res.json();
}

// ===== Contact Detail =====

export interface ContactDetail {
  contact: Contact;
  deals: Deal[];
  activities: Activity[];
}

export async function fetchContact(id: string): Promise<ContactDetail> {
  const res = await fetch(`/api/contacts/${id}`);
  return res.json();
}

// ===== Deal Detail =====

export interface DealDetail {
  deal: Deal;
  contact?: Contact;
  activities: Activity[];
}

export async function fetchDeal(id: string): Promise<DealDetail> {
  const res = await fetch(`/api/deals/${id}`);
  return res.json();
}

// ===== Chat =====

export interface ChatResponse {
  content: string;
  richBlocks: RichBlock[];
  suggestedChips: ChipAction[];
  debugToolCalls?: { name: string; arguments: Record<string, unknown> }[];
}

export async function sendChatMessage(
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
  attachments?: FileAttachment[]
): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, attachments }),
  });
  return res.json();
}

// ===== Greeting Builder (client-side, no LLM) =====

export function buildGreetingFromStats(stats: DashboardStats): {
  content: string;
  richBlocks: RichBlock[];
  suggestedChips: ChipAction[];
} {
  const statCards: StatCard[] = [
    { label: "Active Deals", value: stats.activeDealsCount.toString(), subtext: `${formatCurrency(stats.pipelineValue)} pipeline`, trend: "up", trendValue: "+3 this month" },
    { label: "Closing This Month", value: stats.closingThisMonthCount.toString(), subtext: formatCurrency(stats.closingThisMonthValue) },
    { label: "Follow-ups Needed", value: stats.followUpsNeededCount.toString(), subtext: "Contacts not reached in 5+ days", trend: stats.followUpsNeededCount > 3 ? "down" : "neutral", trendValue: "Needs attention" },
    { label: "Weighted Pipeline", value: formatCurrency(stats.weightedPipelineValue), subtext: "Probability-adjusted value", trend: "up", trendValue: "+12%" },
  ];

  // Build task summary for greeting
  const taskParts: string[] = [];
  if (stats.overdueCount && stats.overdueCount > 0) {
    taskParts.push(`**${stats.overdueCount} overdue task${stats.overdueCount > 1 ? "s" : ""}**`);
  }
  if (stats.dueTodayCount && stats.dueTodayCount > 0) {
    taskParts.push(`**${stats.dueTodayCount} task${stats.dueTodayCount > 1 ? "s" : ""} due today**`);
  }
  const taskSummary = taskParts.length > 0 ? ` You have ${taskParts.join(" and ")}.` : "";

  // Build rich blocks: stat cards + task list if tasks exist
  const richBlocks: RichBlock[] = [{ type: "stat-cards", data: statCards }];
  const allTasks = [...(stats.overdueTasks || []), ...(stats.todayTasks || [])];
  if (allTasks.length > 0) {
    richBlocks.push({
      type: "task-list",
      data: {
        tasks: allTasks,
        title: "Today's Tasks",
        overdueCount: stats.overdueCount || 0,
        dueTodayCount: stats.dueTodayCount || 0,
      },
    });
  }

  // Build chips — include task chip if tasks exist
  const suggestedChips: ChipAction[] = [
    { label: "Show pipeline", intent: "show-pipeline" },
    { label: "Closing this month", intent: "deals-closing-soon" },
  ];
  if ((stats.pendingCount || 0) > 0) {
    suggestedChips.push({ label: "Show all tasks", intent: "show-tasks" });
  } else {
    suggestedChips.push({ label: "Add a task", intent: "add-task" });
  }
  suggestedChips.push({ label: "Recent activity", intent: "recent-activity" });
  suggestedChips.push({ label: "Morning briefing", intent: "morning-briefing" });

  const staleCount = (stats as unknown as Record<string, unknown>).staleDealsCount as number || 0;
  const stalePart = staleCount > 0 ? ` **${staleCount} deal${staleCount === 1 ? " needs" : "s need"}** attention.` : "";
  const closing = stats.closingThisMonthCount;
  const closingPart = `${closing} deal${closing === 1 ? " is" : "s are"} closing this month.`;
  const hour = new Date().getHours();
  const salutation = hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 17 ? "Good afternoon" : "Good evening";

  return {
    content: `${salutation}${stats.userName ? `, ${stats.userName}` : ""}. You have **${stats.activeDealsCount} active deal${stats.activeDealsCount === 1 ? "" : "s"}** worth **${formatCurrency(stats.pipelineValue)}** in your pipeline. ${closingPart}${taskSummary}${stalePart}`,
    richBlocks,
    suggestedChips,
  };
}
