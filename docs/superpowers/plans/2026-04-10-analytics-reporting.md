# Analytics & Reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add historical analytics — pipeline trends, revenue forecasts, sales velocity, win/loss analysis, activity trends, and CSV export.

**Architecture:** New `src/lib/analytics.ts` module. One new DB table (`pipeline_snapshots`) for time-series data. Snapshots captured lazily on first access each day. All visualizations through DynamicUI charts (area, bar, pie, donut). CSV export returns raw CSV strings.

**Tech Stack:** SQLite, DynamicUI chart system, existing tool pipeline

---

## File Structure

### New files:
- `src/lib/analytics.ts` — All analytics computation + CSV export

### Modified files:
- `src/lib/db.ts` — pipeline_snapshots table + time-range queries
- `src/lib/llm/tools.ts` — 6 tool definitions
- `src/lib/llm/tool-executor.ts` — 6 tool executors
- `src/lib/llm/system-prompt.ts` — Rules 36-41

---

## Task 1: Database Schema and Queries

**Files:** Modify `src/lib/db.ts`

Add `pipeline_snapshots` table to initSchema, plus `PipelineSnapshot` interface, `capturePipelineSnapshot`, `getPipelineSnapshots`, `getActivitiesByDateRange`, `getActivityCountsByTypeInRange`, `getDealsClosedInRange` functions.

Read `docs/superpowers/plans/2026-04-10-analytics-reporting.md` Task 1 from the original plan attempt for the exact code.

Commit: `feat(analytics): add pipeline_snapshots table and time-range query functions`

---

## Task 2: Analytics Module

**Files:** Create `src/lib/analytics.ts`

Contains: `getPipelineTrends`, `getRevenueForecast`, `getSalesVelocity`, `getWinLossAnalysis`, `getActivityTrends`, `exportReportAsCsv`

Commit: `feat(analytics): add pipeline trends, revenue forecast, velocity, win/loss, activity trends, CSV export`

---

## Task 3: Tool Definitions

**Files:** Modify `src/lib/llm/tools.ts`

Add 6 tools: `get_pipeline_trends`, `get_revenue_forecast`, `get_sales_velocity`, `get_win_loss_analysis`, `get_activity_trends`, `export_report`

Commit: `feat(analytics): add 6 LLM tool definitions for analytics and reporting`

---

## Task 4: Tool Executors

**Files:** Modify `src/lib/llm/tool-executor.ts`

Add import for analytics, 6 switch cases, 6 executor functions with DynamicUI chart rendering.

Commit: `feat(analytics): add 6 tool executor handlers for analytics and reporting`

---

## Task 5: System Prompt

**Files:** Modify `src/lib/llm/system-prompt.ts`

Add rules 36-41 and 5 new chip intents.

Commit: `feat(analytics): update system prompt with analytics and reporting rules`

---

## Task 6: Verification

Build check + test all 6 tools.
