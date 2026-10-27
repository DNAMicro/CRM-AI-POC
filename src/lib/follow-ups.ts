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
