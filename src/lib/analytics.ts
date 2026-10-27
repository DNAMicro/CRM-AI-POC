import * as db from "@/lib/db";
import type { Deal, Activity, PipelineStage } from "@/types/crm";

// ===== Pipeline Trends =====

export interface PipelineTrendPoint {
  date: string;
  totalValue: number;
  weightedValue: number;
  dealCount: number;
  byStage: Record<string, { totalValue: number; weightedValue: number; dealCount: number }>;
}

export function getPipelineTrends(opts?: { days?: number }): PipelineTrendPoint[] {
  const days = opts?.days || 30;
  const todayStr = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Capture today's snapshot
  db.capturePipelineSnapshot(todayStr);

  // Fetch snapshots for the date range
  const snapshots = db.getPipelineSnapshots({ startDate, endDate: todayStr });

  // Group by date
  const byDate: Record<string, PipelineTrendPoint> = {};
  for (const snap of snapshots) {
    if (!byDate[snap.date]) {
      byDate[snap.date] = {
        date: snap.date,
        totalValue: 0,
        weightedValue: 0,
        dealCount: 0,
        byStage: {},
      };
    }
    const point = byDate[snap.date];

    // Only sum active stages for overall totals
    if (snap.stage !== "closed-won" && snap.stage !== "closed-lost") {
      point.totalValue += snap.totalValue;
      point.weightedValue += snap.weightedValue;
      point.dealCount += snap.dealCount;
    }

    point.byStage[snap.stage] = {
      totalValue: snap.totalValue,
      weightedValue: snap.weightedValue,
      dealCount: snap.dealCount,
    };
  }

  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

// ===== Revenue Forecast =====

export interface RevenueForecast {
  period: string; // "YYYY-MM"
  forecastValue: number;
  closedWonValue: number;
  dealCount: number;
  deals: { id: string; name: string; value: number; probability: number; stage: string }[];
}

export function getRevenueForecast(opts?: { months?: number }): RevenueForecast[] {
  const months = opts?.months || 6;
  const allDeals = db.getAllDeals();
  const results: RevenueForecast[] = [];

  for (let i = 0; i < months; i++) {
    const targetDate = new Date();
    targetDate.setDate(1);
    targetDate.setMonth(targetDate.getMonth() + i);
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const period = `${year}-${month}`;

    const periodStart = `${period}-01`;
    // Last day of the month
    const lastDay = new Date(year, targetDate.getMonth() + 1, 0).getDate();
    const periodEnd = `${period}-${String(lastDay).padStart(2, "0")}`;

    const periodDeals = allDeals.filter(d => {
      const closeDate = d.closeDate.split("T")[0];
      return closeDate >= periodStart && closeDate <= periodEnd;
    });

    let forecastValue = 0;
    let closedWonValue = 0;

    for (const deal of periodDeals) {
      if (deal.stage === "closed-won") {
        closedWonValue += deal.value;
        forecastValue += deal.value;
      } else if (deal.stage !== "closed-lost") {
        forecastValue += deal.value * deal.probability / 100;
      }
    }

    results.push({
      period,
      forecastValue: Math.round(forecastValue),
      closedWonValue: Math.round(closedWonValue),
      dealCount: periodDeals.length,
      deals: periodDeals.map(d => ({
        id: d.id,
        name: d.name,
        value: d.value,
        probability: d.probability,
        stage: d.stage,
      })),
    });
  }

  return results;
}

// ===== Sales Velocity =====

export interface SalesVelocity {
  avgDaysPerStage: Record<string, number>;
  avgCycleTime: number;
  conversionRates: Record<string, number>;
  velocity: number;
}

export function getSalesVelocity(): SalesVelocity {
  const wonDeals = db.getWonDeals();
  const activeDeals = db.getActiveDeals();
  const lostDeals = db.getLostDeals();

  // Average cycle time from won deals (createdAt to updatedAt)
  let avgCycleTime = 0;
  if (wonDeals.length > 0) {
    const cycleTimes = wonDeals.map(d =>
      Math.floor((new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    );
    avgCycleTime = Math.round(cycleTimes.reduce((s, t) => s + t, 0) / cycleTimes.length);
  }

  // Average days per stage for active deals (using updatedAt as proxy for last stage change)
  const stageGroups: Record<string, number[]> = {};
  for (const deal of activeDeals) {
    const daysInStage = Math.floor((Date.now() - new Date(deal.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
    if (!stageGroups[deal.stage]) stageGroups[deal.stage] = [];
    stageGroups[deal.stage].push(daysInStage);
  }
  const avgDaysPerStage: Record<string, number> = {};
  for (const [stage, days] of Object.entries(stageGroups)) {
    avgDaysPerStage[stage] = Math.round(days.reduce((s, d) => s + d, 0) / days.length);
  }

  // Conversion rates between stages (approximate from pipeline distribution)
  const STAGES: PipelineStage[] = ["lead", "qualified", "proposal", "negotiation", "closed-won"];
  const stageCounts: Record<string, number> = {};
  for (const deal of [...activeDeals, ...wonDeals, ...lostDeals]) {
    stageCounts[deal.stage] = (stageCounts[deal.stage] || 0) + 1;
  }
  const conversionRates: Record<string, number> = {};
  for (let i = 0; i < STAGES.length - 1; i++) {
    const fromStage = STAGES[i];
    const toStage = STAGES[i + 1];
    const fromCount = stageCounts[fromStage] || 0;
    const toCount = stageCounts[toStage] || 0;
    const denominator = fromCount + toCount;
    conversionRates[`${fromStage}_to_${toStage}`] = denominator > 0
      ? Math.round((toCount / denominator) * 100)
      : 0;
  }

  // Velocity formula: (deals * win_rate * avg_value) / avg_cycle_time
  const totalClosed = wonDeals.length + lostDeals.length;
  const winRate = totalClosed > 0 ? wonDeals.length / totalClosed : 0;
  const avgWonValue = wonDeals.length > 0
    ? wonDeals.reduce((s, d) => s + d.value, 0) / wonDeals.length
    : 0;
  const velocity = avgCycleTime > 0
    ? Math.round((activeDeals.length * winRate * avgWonValue) / avgCycleTime)
    : 0;

  return { avgDaysPerStage, avgCycleTime, conversionRates, velocity };
}

// ===== Win/Loss Analysis =====

export interface WinLossAnalysis {
  winRate: number;
  totalWon: number;
  totalLost: number;
  avgWonValue: number;
  avgLostValue: number;
  avgWonCycleTime: number;
  avgLostCycleTime: number;
  byValueRange: {
    range: string;
    won: number;
    lost: number;
    winRate: number;
  }[];
  byMonth: {
    period: string;
    won: number;
    lost: number;
    winRate: number;
    wonValue: number;
  }[];
}

export function getWinLossAnalysis(opts?: { startDate?: string; endDate?: string }): WinLossAnalysis {
  const startDate = opts?.startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = opts?.endDate || new Date().toISOString();

  const closedDeals = db.getDealsClosedInRange(startDate, endDate);
  const wonDeals = closedDeals.filter(d => d.stage === "closed-won");
  const lostDeals = closedDeals.filter(d => d.stage === "closed-lost");

  const totalClosed = wonDeals.length + lostDeals.length;
  const winRate = totalClosed > 0 ? Math.round((wonDeals.length / totalClosed) * 100) : 0;

  const avgWonValue = wonDeals.length > 0
    ? Math.round(wonDeals.reduce((s, d) => s + d.value, 0) / wonDeals.length)
    : 0;
  const avgLostValue = lostDeals.length > 0
    ? Math.round(lostDeals.reduce((s, d) => s + d.value, 0) / lostDeals.length)
    : 0;

  const cycleTime = (d: Deal) =>
    Math.floor((new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  const avgWonCycleTime = wonDeals.length > 0
    ? Math.round(wonDeals.reduce((s, d) => s + cycleTime(d), 0) / wonDeals.length)
    : 0;
  const avgLostCycleTime = lostDeals.length > 0
    ? Math.round(lostDeals.reduce((s, d) => s + cycleTime(d), 0) / lostDeals.length)
    : 0;

  // Breakdown by value range
  const VALUE_RANGES = [
    { label: "$0–$5k", min: 0, max: 5000 },
    { label: "$5k–$25k", min: 5000, max: 25000 },
    { label: "$25k–$100k", min: 25000, max: 100000 },
    { label: "$100k+", min: 100000, max: Infinity },
  ];
  const byValueRange = VALUE_RANGES.map(range => {
    const rangeWon = wonDeals.filter(d => d.value >= range.min && d.value < range.max).length;
    const rangeLost = lostDeals.filter(d => d.value >= range.min && d.value < range.max).length;
    const rangeTotal = rangeWon + rangeLost;
    return {
      range: range.label,
      won: rangeWon,
      lost: rangeLost,
      winRate: rangeTotal > 0 ? Math.round((rangeWon / rangeTotal) * 100) : 0,
    };
  });

  // Breakdown by month
  const monthMap: Record<string, { won: number; lost: number; wonValue: number }> = {};
  for (const deal of closedDeals) {
    const period = deal.updatedAt.slice(0, 7); // "YYYY-MM"
    if (!monthMap[period]) monthMap[period] = { won: 0, lost: 0, wonValue: 0 };
    if (deal.stage === "closed-won") {
      monthMap[period].won++;
      monthMap[period].wonValue += deal.value;
    } else {
      monthMap[period].lost++;
    }
  }
  const byMonth = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, data]) => {
      const total = data.won + data.lost;
      return {
        period,
        won: data.won,
        lost: data.lost,
        winRate: total > 0 ? Math.round((data.won / total) * 100) : 0,
        wonValue: Math.round(data.wonValue),
      };
    });

  return {
    winRate,
    totalWon: wonDeals.length,
    totalLost: lostDeals.length,
    avgWonValue,
    avgLostValue,
    avgWonCycleTime,
    avgLostCycleTime,
    byValueRange,
    byMonth,
  };
}

// ===== Activity Trends =====

export interface ActivityTrends {
  totalActivities: number;
  byType: Record<string, number>;
  byWeek: { weekStart: string; count: number; byType: Record<string, number> }[];
  mostActiveContacts: { contactId: string; contactName: string; activityCount: number }[];
}

export function getActivityTrends(opts?: { days?: number }): ActivityTrends {
  const days = opts?.days || 90;
  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const activities = db.getActivitiesByDateRange(startDate, endDate);
  const byType = db.getActivityCountsByTypeInRange(startDate, endDate);
  const totalActivities = activities.length;

  // Group by week (week start = Monday)
  const weekMap: Record<string, { count: number; byType: Record<string, number> }> = {};
  for (const activity of activities) {
    const date = new Date(activity.timestamp);
    // Get Monday of the week
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1 - day); // adjust for Sunday (0) vs Monday (1)
    const monday = new Date(date);
    monday.setDate(date.getDate() + diff);
    const weekStart = monday.toISOString().split("T")[0];

    if (!weekMap[weekStart]) weekMap[weekStart] = { count: 0, byType: {} };
    weekMap[weekStart].count++;
    weekMap[weekStart].byType[activity.type] = (weekMap[weekStart].byType[activity.type] || 0) + 1;
  }
  const byWeek = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, data]) => ({ weekStart, count: data.count, byType: data.byType }));

  // Top 5 most active contacts
  const contactCounts: Record<string, number> = {};
  for (const activity of activities) {
    if (activity.contactId) {
      contactCounts[activity.contactId] = (contactCounts[activity.contactId] || 0) + 1;
    }
  }
  const mostActiveContacts = Object.entries(contactCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([contactId, count]) => {
      const contact = db.getContact(contactId);
      return {
        contactId,
        contactName: contact ? `${contact.firstName} ${contact.lastName}` : contactId,
        activityCount: count,
      };
    });

  return { totalActivities, byType, byWeek, mostActiveContacts };
}

// ===== CSV Export =====

function escapeCsv(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(values: unknown[]): string {
  return values.map(escapeCsv).join(",");
}

export function exportReportAsCsv(reportType: string, _data?: unknown): string {
  switch (reportType) {
    case "deals": {
      const deals = db.getAllDeals();
      const headers = ["ID", "Name", "Company", "Value", "Stage", "Probability", "Close Date", "Priority", "Assigned To", "Created At", "Updated At"];
      const rows = deals.map(d => toCsvRow([
        d.id, d.name, d.company, d.value, d.stage, d.probability,
        d.closeDate, d.priority, d.assignedTo, d.createdAt, d.updatedAt,
      ]));
      return [toCsvRow(headers), ...rows].join("\n");
    }

    case "contacts": {
      const contacts = db.getAllContacts();
      const headers = ["ID", "First Name", "Last Name", "Email", "Company", "Title", "Phone", "Status", "Tags", "Last Contacted At", "Created At"];
      const rows = contacts.map(c => toCsvRow([
        c.id, c.firstName, c.lastName, c.email, c.company, c.title, c.phone,
        c.status, Array.isArray(c.tags) ? c.tags.join(";") : c.tags,
        c.lastContactedAt, c.createdAt,
      ]));
      return [toCsvRow(headers), ...rows].join("\n");
    }

    case "activities": {
      const activities = db.getRecentActivities(500);
      const headers = ["ID", "Type", "Contact ID", "Deal ID", "Description", "Timestamp"];
      const rows = activities.map(a => toCsvRow([
        a.id, a.type, a.contactId, a.dealId || "", a.description, a.timestamp,
      ]));
      return [toCsvRow(headers), ...rows].join("\n");
    }

    case "pipeline": {
      const deals = db.getActiveDeals();
      const headers = ["ID", "Name", "Company", "Value", "Weighted Value", "Stage", "Probability", "Close Date", "Priority", "Days Open"];
      const rows = deals.map(d => {
        const daysOpen = Math.floor((Date.now() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        const weightedValue = Math.round(d.value * d.probability / 100);
        return toCsvRow([
          d.id, d.name, d.company, d.value, weightedValue, d.stage,
          d.probability, d.closeDate, d.priority, daysOpen,
        ]);
      });
      return [toCsvRow(headers), ...rows].join("\n");
    }

    default:
      return `"Error","Unknown report type: ${reportType}"`;
  }
}
