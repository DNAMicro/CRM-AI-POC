import { NextResponse } from "next/server";
import { getDashboardStats, getSetting, getTaskStats, getOverdueTasks, getTasksDueToday } from "@/lib/db";
import { getStaleDealsList, getFollowUpSuggestions } from "@/lib/follow-ups";

export async function GET() {
  const stats = getDashboardStats();
  const userName = getSetting("user_name") || "";
  const taskStats = getTaskStats();
  const overdueTasks = getOverdueTasks().slice(0, 5);
  const todayTasks = getTasksDueToday().slice(0, 5);
  const staleDealsCount = getStaleDealsList({ minDays: 7 }).length;
  const followUpSuggestionsCount = getFollowUpSuggestions({ limit: 100 }).length;
  return NextResponse.json({ ...stats, userName, ...taskStats, overdueTasks, todayTasks, staleDealsCount, followUpSuggestionsCount });
}
