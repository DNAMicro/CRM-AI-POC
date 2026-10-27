import { NextRequest, NextResponse } from "next/server";
import { getConversations, createConversation } from "@/lib/db";

export async function GET() {
  const conversations = getConversations();
  return NextResponse.json(conversations);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const conversation = createConversation(body.title);
    return NextResponse.json(conversation, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
