import { NextRequest, NextResponse } from "next/server";
import { getTasks, insertTask, getTaskStats } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const dueDate = searchParams.get("dueDate") || undefined;
  const contactId = searchParams.get("contactId") || undefined;
  const dealId = searchParams.get("dealId") || undefined;
  const includeOverdue = searchParams.get("includeOverdue") === "true";
  const statsOnly = searchParams.get("statsOnly") === "true";

  if (statsOnly) {
    return NextResponse.json(getTaskStats());
  }

  const tasks = getTasks({ status, dueDate, contactId, dealId, includeOverdue });
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.title || !body.dueDate) {
      return NextResponse.json({ error: "title and dueDate are required" }, { status: 400 });
    }
    const task = insertTask(body);
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
