import * as db from "@/lib/db";
import type { Deal, Contact, Activity } from "@/types/crm";

// ===== Lead Scoring =====

export interface LeadScore {
  contactId: string;
  contactName: string;
  email: string;
  company: string;
  score: number; // 0-100
  tier: "hot" | "warm" | "cold";
  signals: { label: string; points: number; detail: string }[];
}

export function getLeadScores(opts?: { limit?: number }): LeadScore[] {
  const limit = opts?.limit || 20;
  const contacts = db.getAllContacts().filter(c => c.status === "active");
  const results: LeadScore[] = [];

  for (const contact of contacts) {
    const signals: { label: string; points: number; detail: string }[] = [];
    let score = 0;

    // Signal 1: Email activity (0-25 points)
    const emailCount30d = db.getEmailCountByContact(contact.id, { inLastDays: 30 });
    const emailPoints = Math.min(25, emailCount30d * 5);
    if (emailCount30d > 0) {
      signals.push({ label: "Email activity", points: emailPoints, detail: `${emailCount30d} emails in last 30 days` });
    }
    score += emailPoints;

    // Signal 2: Meeting frequency (0-25 points)
    const meetingCount30d = db.getActivityCountByType(contact.id, { type: "meeting", inLastDays: 30 });
    const meetingPoints = Math.min(25, meetingCount30d * 10);
    if (meetingCount30d > 0) {
      signals.push({ label: "Meetings", points: meetingPoints, detail: `${meetingCount30d} meetings in last 30 days` });
    }
    score += meetingPoints;

    // Signal 3: Recency of interaction (0-20 points)
    const daysSinceContact = Math.floor((Date.now() - new Date(contact.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24));
    const recencyPoints = daysSinceContact <= 3 ? 20 : daysSinceContact <= 7 ? 15 : daysSinceContact <= 14 ? 10 : daysSinceContact <= 30 ? 5 : 0;
    signals.push({ label: "Recency", points: recencyPoints, detail: daysSinceContact === 0 ? "Contacted today" : `${daysSinceContact} days ago` });
    score += recencyPoints;

    // Signal 4: Deal progression (0-20 points)
    const deals = db.getDealsByContact(contact.id);
    const activeDeals = deals.filter(d => d.stage !== "closed-won" && d.stage !== "closed-lost");
    const stagePoints: Record<string, number> = { lead: 5, qualified: 10, proposal: 15, negotiation: 20 };
    const maxDealPoints = activeDeals.reduce((max, d) => Math.max(max, stagePoints[d.stage] || 0), 0);
    if (activeDeals.length > 0) {
      const bestDeal = activeDeals.sort((a, b) => (stagePoints[b.stage] || 0) - (stagePoints[a.stage] || 0))[0];
      signals.push({ label: "Deal stage", points: maxDealPoints, detail: `${bestDeal.name} in ${bestDeal.stage}` });
    }
    score += maxDealPoints;

    // Signal 5: Call activity (0-10 points)
    const callCount30d = db.getActivityCountByType(contact.id, { type: "call", inLastDays: 30 });
    const callPoints = Math.min(10, callCount30d * 5);
    if (callCount30d > 0) {
      signals.push({ label: "Calls", points: callPoints, detail: `${callCount30d} calls in last 30 days` });
    }
    score += callPoints;

    const tier = score >= 60 ? "hot" : score >= 30 ? "warm" : "cold";

    results.push({
      contactId: contact.id,
      contactName: `${contact.firstName} ${contact.lastName}`,
      email: contact.email,
      company: contact.company,
      score,
      tier,
      signals: signals.filter(s => s.points > 0),
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ===== Deal Health =====

export interface DealHealth {
  dealId: string;
  dealName: string;
  contactName: string;
  value: number;
  stage: string;
  health: "green" | "yellow" | "red";
  healthScore: number; // 0-100
  factors: { label: string; status: "good" | "warning" | "bad"; detail: string }[];
}

export function getDealHealthList(opts?: { dealId?: string }): DealHealth[] {
  const deals = opts?.dealId
    ? [db.getDeal(opts.dealId)].filter(Boolean) as Deal[]
    : db.getActiveDeals();
  const results: DealHealth[] = [];

  for (const deal of deals) {
    const contact = deal.contactId ? db.getContact(deal.contactId) : undefined;
    const factors: { label: string; status: "good" | "warning" | "bad"; detail: string }[] = [];
    let healthScore = 100;

    // Factor 1: Days in current stage
    const daysSinceUpdate = Math.floor((Date.now() - new Date(deal.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
    const avgDaysPerStage: Record<string, number> = { lead: 7, qualified: 14, proposal: 10, negotiation: 7 };
    const expectedDays = avgDaysPerStage[deal.stage] || 10;
    if (daysSinceUpdate > expectedDays * 2) {
      factors.push({ label: "Time in stage", status: "bad", detail: `${daysSinceUpdate} days (expected ~${expectedDays})` });
      healthScore -= 30;
    } else if (daysSinceUpdate > expectedDays) {
      factors.push({ label: "Time in stage", status: "warning", detail: `${daysSinceUpdate} days (expected ~${expectedDays})` });
      healthScore -= 15;
    } else {
      factors.push({ label: "Time in stage", status: "good", detail: `${daysSinceUpdate} days — on track` });
    }

    // Factor 2: Recent activity
    const lastActivityDate = db.getLastActivityDateForDeal(deal.id);
    const daysSinceActivity = lastActivityDate
      ? Math.floor((Date.now() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    if (daysSinceActivity > 14) {
      factors.push({ label: "Activity recency", status: "bad", detail: `No activity in ${daysSinceActivity} days` });
      healthScore -= 30;
    } else if (daysSinceActivity > 7) {
      factors.push({ label: "Activity recency", status: "warning", detail: `Last activity ${daysSinceActivity} days ago` });
      healthScore -= 15;
    } else {
      factors.push({ label: "Activity recency", status: "good", detail: daysSinceActivity === 0 ? "Activity today" : `Last activity ${daysSinceActivity} days ago` });
    }

    // Factor 3: Activity volume (last 30 days)
    const activityCount30d = db.getActivityCountByDeal(deal.id, { inLastDays: 30 });
    if (activityCount30d === 0) {
      factors.push({ label: "Activity volume", status: "bad", detail: "No activities in 30 days" });
      healthScore -= 20;
    } else if (activityCount30d < 3) {
      factors.push({ label: "Activity volume", status: "warning", detail: `Only ${activityCount30d} activities in 30 days` });
      healthScore -= 10;
    } else {
      factors.push({ label: "Activity volume", status: "good", detail: `${activityCount30d} activities in 30 days` });
    }

    // Factor 4: Close date proximity
    const daysToClose = Math.floor((new Date(deal.closeDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysToClose < 0) {
      factors.push({ label: "Close date", status: "bad", detail: `Overdue by ${Math.abs(daysToClose)} days` });
      healthScore -= 20;
    } else if (daysToClose < 7) {
      factors.push({ label: "Close date", status: "warning", detail: `Closing in ${daysToClose} days` });
    } else {
      factors.push({ label: "Close date", status: "good", detail: `${daysToClose} days until close date` });
    }

    healthScore = Math.max(0, Math.min(100, healthScore));
    const health = healthScore >= 70 ? "green" : healthScore >= 40 ? "yellow" : "red";

    results.push({
      dealId: deal.id,
      dealName: deal.name,
      contactName: contact ? `${contact.firstName} ${contact.lastName}` : deal.company,
      value: deal.value,
      stage: deal.stage,
      health,
      healthScore,
      factors,
    });
  }

  return results.sort((a, b) => a.healthScore - b.healthScore); // Worst health first
}

// ===== Relationship Strength =====

export interface RelationshipStrength {
  contactId: string;
  contactName: string;
  company: string;
  strength: "strong" | "moderate" | "weak" | "dormant";
  strengthScore: number; // 0-100
  signals: { label: string; value: string }[];
}

export function getRelationshipMap(opts?: { limit?: number }): RelationshipStrength[] {
  const limit = opts?.limit || 20;
  const contacts = db.getAllContacts().filter(c => c.status === "active");
  const results: RelationshipStrength[] = [];

  for (const contact of contacts) {
    const signals: { label: string; value: string }[] = [];
    let score = 0;

    // Communication frequency (last 30 days)
    const emailCount = db.getEmailCountByContact(contact.id, { inLastDays: 30 });
    const smsCount = db.getSmsCountByContact(contact.id, { inLastDays: 30 });
    const callCount = db.getActivityCountByType(contact.id, { type: "call", inLastDays: 30 });
    const meetingCount = db.getActivityCountByType(contact.id, { type: "meeting", inLastDays: 30 });
    const totalComms = emailCount + smsCount + callCount + meetingCount;

    score += Math.min(40, totalComms * 5); // Up to 40 points
    signals.push({ label: "Communications (30d)", value: `${totalComms} (${emailCount} email, ${callCount} call, ${meetingCount} meeting)` });

    // Recency
    const daysSince = Math.floor((Date.now() - new Date(contact.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24));
    const recencyScore = daysSince <= 3 ? 30 : daysSince <= 7 ? 20 : daysSince <= 14 ? 10 : daysSince <= 30 ? 5 : 0;
    score += recencyScore;
    signals.push({ label: "Last contact", value: daysSince === 0 ? "Today" : `${daysSince} days ago` });

    // Deal involvement
    const deals = db.getDealsByContact(contact.id);
    const activeDeals = deals.filter(d => d.stage !== "closed-won" && d.stage !== "closed-lost");
    const wonDeals = deals.filter(d => d.stage === "closed-won");
    score += Math.min(20, activeDeals.length * 10);
    score += Math.min(10, wonDeals.length * 5);
    if (deals.length > 0) {
      signals.push({ label: "Deals", value: `${activeDeals.length} active, ${wonDeals.length} won` });
    }

    score = Math.min(100, score);
    const strength = score >= 60 ? "strong" : score >= 35 ? "moderate" : score >= 15 ? "weak" : "dormant";

    results.push({
      contactId: contact.id,
      contactName: `${contact.firstName} ${contact.lastName}`,
      company: contact.company,
      strength,
      strengthScore: score,
      signals,
    });
  }

  return results.sort((a, b) => b.strengthScore - a.strengthScore).slice(0, limit);
}

// ===== Sales Insights / Win-Loss Patterns =====

export interface SalesInsight {
  type: "pattern" | "warning" | "opportunity";
  title: string;
  description: string;
  evidence: string;
}

export function getSalesInsights(): SalesInsight[] {
  const insights: SalesInsight[] = [];
  const wonDeals = db.getWonDeals();
  const lostDeals = db.getLostDeals();
  const activeDeals = db.getActiveDeals();

  // Insight 1: Win rate
  const totalClosed = wonDeals.length + lostDeals.length;
  if (totalClosed > 0) {
    const winRate = Math.round((wonDeals.length / totalClosed) * 100);
    insights.push({
      type: "pattern",
      title: `Win rate: ${winRate}%`,
      description: `You've closed ${wonDeals.length} deals and lost ${lostDeals.length}.`,
      evidence: `${totalClosed} total closed deals`,
    });
  }

  // Insight 2: Average deal size (won)
  if (wonDeals.length > 0) {
    const avgValue = Math.round(wonDeals.reduce((s, d) => s + d.value, 0) / wonDeals.length);
    insights.push({
      type: "pattern",
      title: `Average won deal: $${avgValue.toLocaleString()}`,
      description: "This is your average closed-won deal size.",
      evidence: `Based on ${wonDeals.length} won deals`,
    });
  }

  // Insight 3: Average deal cycle time (won deals)
  if (wonDeals.length > 0) {
    const cycleTimes = wonDeals.map(d => {
      const days = Math.floor((new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      return days;
    });
    const avgCycleTime = Math.round(cycleTimes.reduce((s, d) => s + d, 0) / cycleTimes.length);
    insights.push({
      type: "pattern",
      title: `Average sales cycle: ${avgCycleTime} days`,
      description: "From deal creation to close-won.",
      evidence: `Based on ${wonDeals.length} won deals`,
    });
  }

  // Insight 4: Deals at risk (active deals with poor health)
  const healthList = getDealHealthList();
  const redDeals = healthList.filter(d => d.health === "red");
  if (redDeals.length > 0) {
    insights.push({
      type: "warning",
      title: `${redDeals.length} deal${redDeals.length > 1 ? "s" : ""} at risk`,
      description: `These deals have poor health scores and may be lost: ${redDeals.map(d => d.dealName).join(", ")}.`,
      evidence: `Health scores: ${redDeals.map(d => `${d.dealName} (${d.healthScore})`).join(", ")}`,
    });
  }

  // Insight 5: Pipeline concentration
  if (activeDeals.length > 0) {
    const stageGroups: Record<string, number> = {};
    for (const deal of activeDeals) {
      stageGroups[deal.stage] = (stageGroups[deal.stage] || 0) + 1;
    }
    const dominantStage = Object.entries(stageGroups).sort((a, b) => b[1] - a[1])[0];
    if (dominantStage && dominantStage[1] > activeDeals.length * 0.5) {
      insights.push({
        type: "warning",
        title: `Pipeline bottleneck at ${dominantStage[0]}`,
        description: `${dominantStage[1]} of ${activeDeals.length} active deals (${Math.round((dominantStage[1] / activeDeals.length) * 100)}%) are stuck in ${dominantStage[0]} stage.`,
        evidence: `Stage distribution: ${Object.entries(stageGroups).map(([s, c]) => `${s}: ${c}`).join(", ")}`,
      });
    }
  }

  // Insight 6: Relationship health — weakening contacts with active deals
  const relationships = getRelationshipMap({ limit: 100 });
  const weakWithDeals = relationships.filter(r => {
    if (r.strength !== "weak" && r.strength !== "dormant") return false;
    const deals = db.getDealsByContact(r.contactId);
    return deals.some(d => d.stage !== "closed-won" && d.stage !== "closed-lost");
  });
  if (weakWithDeals.length > 0) {
    insights.push({
      type: "opportunity",
      title: `${weakWithDeals.length} contact${weakWithDeals.length > 1 ? "s" : ""} with active deals need re-engagement`,
      description: `These contacts have weak relationships but active deals: ${weakWithDeals.map(r => r.contactName).slice(0, 3).join(", ")}${weakWithDeals.length > 3 ? "..." : ""}.`,
      evidence: "Re-engaging could prevent deal stalls",
    });
  }

  return insights;
}
