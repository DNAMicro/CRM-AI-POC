import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getCrmTools } from "@/lib/llm/tools";
import { executeTool } from "@/lib/llm/tool-executor";
import { captureSql } from "@/lib/db";
import { getSystemPrompt } from "@/lib/llm/system-prompt";
import type { RichBlock, ChipAction, DebugToolCall } from "@/types/conversation";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

const MODEL = process.env.OPENROUTER_MODEL || "google/gemini-3.1-flash-lite-preview";

interface ChatRequest {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
  attachments?: { id: string; filename: string; url: string; size: number; mimeType: string }[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequest;
    const { message, history = [], attachments } = body;

    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === "your-api-key-here") {
      return NextResponse.json({
        content: "OpenRouter API key not configured. Please set `OPENROUTER_API_KEY` in `.env.local`.",
        richBlocks: [],
        suggestedChips: [
          { label: "Show pipeline", intent: "show-pipeline" },
          { label: "Show contacts", intent: "show-contacts" },
        ],
      });
    }

    // Build message history (trim to last 10, truncate long messages to save context)
    const MAX_MSG_LENGTH = 1200;
    const trimmedHistory = history.slice(-10).map((msg): ChatCompletionMessageParam => ({
      role: msg.role,
      content: msg.content.length > MAX_MSG_LENGTH
        ? msg.content.slice(0, MAX_MSG_LENGTH) + "\n...[earlier details truncated]"
        : msg.content,
    }));

    // Build user content with attachment metadata if present
    let userContent = message;
    if (attachments && attachments.length > 0) {
      const fileList = attachments.map((a) => `- ${a.filename} (id: ${a.id}, ${a.mimeType}, ${a.size} bytes)`).join("\n");
      userContent = `${message}\n\n[Attached files]\n${fileList}`;
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: getSystemPrompt() },
      ...trimmedHistory,
      { role: "user", content: userContent },
    ];

    // Collect rich blocks and debug info from all tool executions
    const allRichBlocks: RichBlock[] = [];
    const seenBlocks = new Set<string>();
    const toolCalls: DebugToolCall[] = [];

    // Tool-calling loop (max 5 iterations)
    let response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: getCrmTools(),
      temperature: 0.3,
    });

    let iterations = 0;
    while (response.choices[0]?.message?.tool_calls && iterations < 5) {
      iterations++;
      const assistantMessage = response.choices[0].message;
      messages.push(assistantMessage);

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls!) {
        if (toolCall.type !== "function") continue;
        const args = JSON.parse(toolCall.function.arguments || "{}");
        const { result, sql, sqlOmitted } = captureSql(() => executeTool(toolCall.function.name, args));
        toolCalls.push({ name: toolCall.function.name, arguments: args, sql, ...(sqlOmitted ? { sqlOmitted } : {}) });

        // Skip blocks identical to ones already shown (e.g. the same timeline
        // returned by both a detail tool and an activity tool)
        for (const block of result.richBlocks) {
          const key = JSON.stringify(block);
          if (!seenBlocks.has(key)) {
            seenBlocks.add(key);
            allRichBlocks.push(block);
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result.rawData),
        });
      }

      // Call LLM again with tool results
      response = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools: getCrmTools(),
        temperature: 0.3,
      });
    }

    // Extract final text response
    let content = response.choices[0]?.message?.content || "I couldn't generate a response. Please try again.";

    // Parse suggestedChips from the response text
    let suggestedChips: ChipAction[] = [];
    const chipsMatch = content.match(/```suggestedChips\s*([\s\S]*?)```/);
    if (chipsMatch) {
      try {
        suggestedChips = JSON.parse(chipsMatch[1].trim());
        // Remove the chips block from the displayed text
        content = content.replace(/```suggestedChips\s*[\s\S]*?```/, "").trim();
      } catch {
        // If parsing fails, provide defaults
      }
    }

    // Provide default chips if none were generated
    if (suggestedChips.length === 0) {
      suggestedChips = [
        { label: "Show pipeline", intent: "show-pipeline" },
        { label: "Show contacts", intent: "show-contacts" },
        { label: "Recent activity", intent: "recent-activity" },
      ];
    }

    return NextResponse.json({
      content,
      richBlocks: allRichBlocks,
      suggestedChips,
      debugToolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const message = (error instanceof Error ? error.message : "Unknown error").replace(/\.+$/, "");
    return NextResponse.json({
      content: `Sorry, I encountered an error: ${message}. Please try again.`,
      richBlocks: [],
      suggestedChips: [
        { label: "Show pipeline", intent: "show-pipeline" },
        { label: "Show contacts", intent: "show-contacts" },
      ],
    }, { status: 502 });
  }
}
