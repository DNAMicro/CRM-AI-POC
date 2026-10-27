import { NextRequest, NextResponse } from "next/server";
import { addConversationMessage, getConversation } from "@/lib/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const conversation = getConversation(id);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const body = await request.json();
    addConversationMessage({
      conversationId: id,
      id: body.id,
      role: body.role,
      content: body.content || "",
      richBlocks: body.richBlocks,
      suggestedChips: body.suggestedChips,
      attachments: body.attachments,
      debugToolCalls: body.debugToolCalls,
      timestamp: body.timestamp,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
