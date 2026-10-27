# AI Intelligence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered intelligence features — lead scoring, deal health indicators, relationship strength mapping, and win/loss pattern detection — using existing CRM data.

**Architecture:** New `src/lib/intelligence.ts` module with scoring algorithms that analyze contacts, deals, activities, and emails. No new DB tables — just new query helpers in db.ts for counting/aggregating. All results rendered through existing DynamicUI. Follows the exact same pattern as `src/lib/follow-ups.ts`.

**Tech Stack:** SQLite queries, existing DynamicUI system, existing tool-calling pipeline

**Spec:** `docs/superpowers/specs/2026-04-10-crm-advanced-features-design.md` (Phase 3)

---

## File Structure

### New files:
- `src/lib/intelligence.ts` — Scoring algorithms: lead scoring, deal health, relationship strength, sales insights

### Modified files:
- `src/lib/db.ts` — New aggregate query functions (counts, frequencies)
- `src/lib/llm/tools.ts` — 4 new tool definitions
- `src/lib/llm/tool-executor.ts` — 4 new tool execution handlers
- `src/lib/llm/system-prompt.ts` — New rules for intelligence tools

---

## Task 1: Database Aggregate Query Functions

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add count and frequency queries**

Add after `getLastActivityDateForContact` in `src/lib/db.ts`:

```typescript
// ===== AGGREGATE QUERIES FOR INTELLIGENCE =====

export function getEmailCountByContact(contactId: string, opts?: { inLastDays?: number }): number {
  const db = getDb();
  let sql = "SELECT COUNT(*) as cnt FROM emails WHERE contactId = ?";
  const params: unknown[] = [contactId];
  if (opts?.inLastDays) {
    const cutoff = new Date(Date.now() - opts.inLastDays * 24 * 60 * 60 * 1000).toISOString();
    sql += " AND sentAt >= ?";
    params.push(cutoff);
  }
  return (db.prepare(sql).get(...params) as { cnt: number }).cnt;
}

export function getSmsCountByContact(contactId: string, opts?: { inLastDays?: number }): number {
  const db = getDb();
  let sql = "SELECT COUNT(*) as cnt FROM sms_messages WHERE contactId = ?";
  const params: unknown[] = [contactId];
  if (opts?.inLastDays) {
    const cutoff = new Date(Date.now() - opts.inLastDays * 24 * 60 * 60 * 1000).toISOString();
    sql += " AND sentAt >= ?";
    params.push(cutoff);
  }
  return (db.prepare(sql).get(...params) as { cnt: number }).cnt;
}

export function getActivityCountByType(contactId: string, opts?: { type?: string; inLastDays?: number }): number {
  const db = getDb();
  const conditions: string[] = ["contactId = ?"];
  const params: unknown[] = [contactId];
  if (opts?.type) {
    conditions.push("type = ?");
    params.push(opts.type);
  }
  if (opts?.inLastDays) {
    const cutoff = new Date(Date.now() - opts.inLastDays * 24 * 60 * 60 * 1000).toISOString();
    conditions.push("timestamp >= ?");
    params.push(cutoff);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  return (db.prepare(`SELECT COUNT(*) as cnt FROM activities ${where}`).get(...params) as { cnt: number }).cnt;
}

export function getActivityCountByDeal(dealId: string, opts?: { inLastDays?: number }): number {
  const db = getDb();
  let sql = "SELECT COUNT(*) as cnt FROM activities WHERE dealId = ?";
  const params: unknown[] = [dealId];
  if (opts?.inLastDays) {
    const cutoff = new Date(Date.now() - opts.inLastDays * 24 * 60 * 60 * 1000).toISOString();
    sql += " AND timestamp >= ?";
    params.push(cutoff);
  }
  return (db.prepare(sql).get(...params) as { cnt: number }).cnt;
}

export function getClosedDeals(): Deal[] {
  return getDb().prepare("SELECT * FROM deals WHERE stage IN ('closed-won', 'closed-lost') ORDER BY updatedAt DESC").all() as Deal[];
}

export function getWonDeals(): Deal[] {
  return getDb().prepare("SELECT * FROM deals WHERE stage = 'closed-won' ORDER BY updatedAt DESC").all() as Deal[];
}

export function getLostDeals(): Deal[] {
  return getDb().prepare("SELECT * FROM deals WHERE stage = 'closed-lost' ORDER BY updatedAt DESC").all() as Deal[];
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat(intelligence): add aggregate query functions for scoring"
```

---

## Task 2: Intelligence Business Logic Module

**Files:**
- Create: `src/lib/intelligence.ts`

- [ ] **Step 1: Create the intelligence module**

Create `src/lib/intelligence.ts`:

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`

- [ ] **Step 3: Commit**

```bash
git add src/lib/intelligence.ts
git commit -m "feat(intelligence): add lead scoring, deal health, relationship mapping, sales insights"
```

---

## Task 3: LLM Tool Definitions

**Files:**
- Modify: `src/lib/llm/tools.ts`

- [ ] **Step 1: Add 4 tool definitions after `get_morning_briefing`**

```typescript
  // ===== AI Intelligence Tools =====
  {
    type: "function",
    function: {
      name: "get_lead_scores",
      description: "Get lead scores (0-100) for contacts based on email activity, meetings, recency, deal progression, and calls. Use when the user asks about lead scores, hot leads, best prospects, or contact engagement levels.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max contacts to return (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deal_health",
      description: "Get health indicators (green/yellow/red) for active deals based on time in stage, activity recency, activity volume, and close date proximity. Use when the user asks about deal health, at-risk deals, or pipeline health.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Specific deal ID (optional — omit for all active deals)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_relationship_map",
      description: "Map relationship strength (strong/moderate/weak/dormant) for contacts based on communication frequency, recency, and deal involvement. Use when the user asks about relationship health, engagement levels, or which contacts need attention.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max contacts to return (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_insights",
      description: "Get AI-generated sales insights including win rate, average deal size, sales cycle time, pipeline bottlenecks, at-risk deals, and re-engagement opportunities. Use when the user asks for insights, patterns, or 'how am I doing?'.",
      parameters: { type: "object", properties: {} },
    },
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/llm/tools.ts
git commit -m "feat(intelligence): add 4 LLM tool definitions for AI intelligence"
```

---

## Task 4: LLM Tool Executors

**Files:**
- Modify: `src/lib/llm/tool-executor.ts`

- [ ] **Step 1: Add import**

After `import * as followUps from "@/lib/follow-ups";` add:
```typescript
import * as intelligence from "@/lib/intelligence";
```

- [ ] **Step 2: Add 4 switch cases after `get_morning_briefing`**

```typescript
    case "get_lead_scores":
      return execGetLeadScores(args);
    case "get_deal_health":
      return execGetDealHealth(args);
    case "get_relationship_map":
      return execGetRelationshipMap(args);
    case "get_sales_insights":
      return execGetSalesInsights();
```

- [ ] **Step 3: Implement execGetLeadScores**

```typescript
function execGetLeadScores(args: Record<string, unknown>): ToolResult {
  const limit = Number(args.limit) || 20;
  const scores = intelligence.getLeadScores({ limit });

  if (scores.length === 0) {
    return { richBlocks: [], rawData: { count: 0, message: "No active contacts to score." } };
  }

  const uiData: DynamicUIData = {
    title: `Lead Scores (${scores.length} contacts)`,
    layout: {
      type: "stack",
      direction: "vertical",
      gap: "md",
      children: [
        {
          type: "table",
          headers: ["Contact", "Company", "Score", "Tier", "Top Signal"],
          rows: scores.map(s => [
            s.contactName,
            s.company,
            `${s.score}/100`,
            s.tier,
            s.signals[0]?.label || "—",
          ]),
        },
      ],
    },
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: uiData }],
    rawData: { count: scores.length, scores: scores.map(s => ({ contactId: s.contactId, name: s.contactName, score: s.score, tier: s.tier })) },
  };
}
```

- [ ] **Step 4: Implement execGetDealHealth**

```typescript
function execGetDealHealth(args: Record<string, unknown>): ToolResult {
  const dealId = args.deal_id ? String(args.deal_id) : undefined;
  const healthList = intelligence.getDealHealthList({ dealId });

  if (healthList.length === 0) {
    return { richBlocks: [], rawData: { count: 0, message: "No active deals to evaluate." } };
  }

  const statusIcon = (h: string) => h === "green" ? "healthy" : h === "yellow" ? "needs attention" : "at risk";

  const uiData: DynamicUIData = {
    title: dealId ? "Deal Health" : `Deal Health (${healthList.length} deals)`,
    layout: {
      type: "stack",
      direction: "vertical",
      gap: "md",
      children: healthList.map(dh => ({
        type: "card" as const,
        title: `${dh.dealName} — $${dh.value.toLocaleString()}`,
        children: [
          {
            type: "badge-group" as const,
            badges: [
              { text: `${dh.health} (${dh.healthScore}/100)`, color: dh.health === "green" ? "emerald" as const : dh.health === "yellow" ? "amber" as const : "red" as const },
              { text: dh.stage, color: "indigo" as const },
            ],
          },
          {
            type: "list" as const,
            items: dh.factors.map(f => ({
              label: f.label,
              value: `${f.status === "good" ? "OK" : f.status === "warning" ? "WARN" : "BAD"} — ${f.detail}`,
            })),
          },
        ],
      }) as DynamicUINode),
    },
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: uiData }],
    rawData: { count: healthList.length, deals: healthList.map(d => ({ dealId: d.dealId, name: d.dealName, health: d.health, score: d.healthScore })) },
  };
}
```

- [ ] **Step 5: Implement execGetRelationshipMap**

```typescript
function execGetRelationshipMap(args: Record<string, unknown>): ToolResult {
  const limit = Number(args.limit) || 20;
  const relationships = intelligence.getRelationshipMap({ limit });

  if (relationships.length === 0) {
    return { richBlocks: [], rawData: { count: 0, message: "No active contacts to map." } };
  }

  const uiData: DynamicUIData = {
    title: `Relationship Map (${relationships.length} contacts)`,
    layout: {
      type: "stack",
      direction: "vertical",
      gap: "md",
      children: [
        {
          type: "table",
          headers: ["Contact", "Company", "Score", "Strength", "Key Signal"],
          rows: relationships.map(r => [
            r.contactName,
            r.company,
            `${r.strengthScore}/100`,
            r.strength,
            r.signals[0]?.value || "—",
          ]),
        },
      ],
    },
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: uiData }],
    rawData: { count: relationships.length, relationships: relationships.map(r => ({ contactId: r.contactId, name: r.contactName, strength: r.strength, score: r.strengthScore })) },
  };
}
```

- [ ] **Step 6: Implement execGetSalesInsights**

```typescript
function execGetSalesInsights(): ToolResult {
  const insights = intelligence.getSalesInsights();

  if (insights.length === 0) {
    return { richBlocks: [], rawData: { count: 0, message: "Not enough data to generate insights yet." } };
  }

  const uiData: DynamicUIData = {
    title: "Sales Insights",
    layout: {
      type: "stack",
      direction: "vertical",
      gap: "md",
      children: insights.map(i => ({
        type: "callout" as const,
        variant: i.type === "warning" ? "warning" as const : i.type === "opportunity" ? "success" as const : "info" as const,
        title: i.title,
        content: `${i.description}\n\n_${i.evidence}_`,
      }) as DynamicUINode),
    },
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: uiData }],
    rawData: { count: insights.length, insights: insights.map(i => ({ type: i.type, title: i.title })) },
  };
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/llm/tool-executor.ts
git commit -m "feat(intelligence): add 4 tool executor handlers for AI intelligence"
```

---

## Task 5: System Prompt Updates

**Files:**
- Modify: `src/lib/llm/system-prompt.ts`

- [ ] **Step 1: Add rules 32-35**

After rule 31 (MORNING BRIEFING), add:

```
32. For LEAD SCORING: Use get_lead_scores when asked about lead scores, hot leads, best prospects, or "who are my best contacts?". Shows contacts scored 0-100 based on engagement signals.
33. For DEAL HEALTH: Use get_deal_health when asked about deal health, at-risk deals, pipeline health, or "which deals need attention?". Shows green/yellow/red health status with contributing factors.
34. For RELATIONSHIP MAP: Use get_relationship_map when asked about relationship strength, engagement levels, or "which contacts am I losing?". Maps each contact as strong/moderate/weak/dormant.
35. For SALES INSIGHTS: Use get_sales_insights when asked "how am I doing?", "give me insights", "what patterns do you see?", or for a general business health check. Shows win rate, deal patterns, and actionable recommendations.
```

- [ ] **Step 2: Add chip intents**

```
- "lead-scores" — View lead scores for contacts
- "deal-health" — Check deal health status
- "relationship-map" — View relationship strength map
- "sales-insights" — Get AI sales insights
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm/system-prompt.ts
git commit -m "feat(intelligence): update system prompt with AI intelligence rules"
```

---

## Task 6: End-to-End Verification

- [ ] **Step 1: Build check**

Run: `npm run build 2>&1 | tail -10`

- [ ] **Step 2: Test tools via chat**

Test: "show me lead scores", "deal health check", "show my relationship map", "give me sales insights"

- [ ] **Step 3: Fix commit if needed**

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | DB aggregate queries | `src/lib/db.ts` |
| 2 | Intelligence logic | `src/lib/intelligence.ts` (new) |
| 3 | 4 tool definitions | `src/lib/llm/tools.ts` |
| 4 | 4 tool executors | `src/lib/llm/tool-executor.ts` |
| 5 | System prompt rules | `src/lib/llm/system-prompt.ts` |
| 6 | E2E verification | All files |

**Total: 1 new file, 4 modified files, 4 new LLM tools, 6 commits**
