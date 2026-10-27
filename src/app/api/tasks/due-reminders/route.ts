import { NextResponse } from "next/server";
import { getTasksDueForReminder, markReminderFired } from "@/lib/db";

export async function GET() {
  const tasks = getTasksDueForReminder();
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const { taskId } = await request.json();
  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }
  markReminderFired(taskId);
  return NextResponse.json({ success: true });
}
