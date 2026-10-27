"use client";

import { useState } from "react";
import type { Message, RichBlock } from "@/types/conversation";
import type { Activity } from "@/types/crm";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MessageMarkdown } from "@/components/conversation/MessageMarkdown";
import { ToolCallSql } from "@/components/conversation/ToolCallSql";
import { StatCardGrid } from "@/components/rich-responses/StatCardGrid";
import { DataTableBlock } from "@/components/rich-responses/DataTable";
import { PipelineBoard } from "@/components/rich-responses/PipelineBoard";
import { ActivityTimeline } from "@/components/rich-responses/ActivityTimeline";
import { ContactCard } from "@/components/rich-responses/ContactCard";
import { DealSummary } from "@/components/rich-responses/DealSummary";
import { ActionButtons } from "@/components/rich-responses/ActionButtons";
import { InlineForm } from "@/components/rich-responses/InlineForm";
import { EmailList } from "@/components/rich-responses/EmailList";
import { EmailDetail } from "@/components/rich-responses/EmailDetail";
import { EmailCompose } from "@/components/rich-responses/EmailCompose";
import { IntegrationStatus } from "@/components/rich-responses/IntegrationStatus";
import { SmsThread } from "@/components/rich-responses/SmsThread";
import { SmsCompose } from "@/components/rich-responses/SmsCompose";
import { DynamicUI } from "@/components/rich-responses/DynamicUI";
import { AttachmentList } from "@/components/rich-responses/AttachmentList";
import { TaskList } from "@/components/rich-responses/TaskList";
import CalendarEvents from "@/components/rich-responses/CalendarEvents";
import type { CalendarEventsData } from "@/types/conversation";
import { SuggestedChips } from "./SuggestedChips";
import { BlockWrapper } from "./BlockWrapper";
import { Bot, FileText, Bug } from "lucide-react";

interface Props {
  message: Message;
  isLatest: boolean;
}

export function MessageBubble({ message, isLatest }: Props) {
  const [showDebug, setShowDebug] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end px-4 py-1.5">
        <div className="max-w-[70%] bg-gradient-to-br from-indigo-500 via-indigo-500 to-violet-600 text-white px-5 py-3.5 rounded-2xl rounded-br-md shadow-glass-lg">
          <p className="text-base leading-relaxed">{message.content}</p>
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex gap-1.5 mt-2.5 flex-wrap">
              {message.attachments.map((att) => (
                <span key={att.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/15 text-[11px] text-white/90">
                  <FileText className="w-3 h-3 opacity-70" />
                  {att.filename}
                  <span className="opacity-50">{formatFileSize(att.size)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3.5 px-4 py-3">
      {/* AI Avatar */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-glass">
        <Bot className="w-4 h-4 text-white" />
      </div>

      {/* Message content */}
      <div className="flex-1 min-w-0 max-w-full">
        {message.content && (
          <div className="text-base text-foreground leading-[1.7]">
            <MessageMarkdown content={message.content} />
          </div>
        )}

        {message.richBlocks?.map((block, i) => (
          <ErrorBoundary key={i} compact fallbackMessage="This block could not be displayed">
            <BlockWrapper block={block}>
              <RichBlockRenderer block={block} />
            </BlockWrapper>
          </ErrorBoundary>
        ))}

        {message.debugToolCalls && message.debugToolCalls.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              title="Show tool calls"
            >
              <Bug className="w-3 h-3" />
              {showDebug ? "Hide" : "Show"} {message.debugToolCalls.length} tool call{message.debugToolCalls.length > 1 ? "s" : ""}
            </button>
            {showDebug && (
              <div className="mt-2 rounded-lg bg-muted/30 border border-border/30 p-3 font-mono text-[11px] text-muted-foreground space-y-2 overflow-x-auto">
                {message.debugToolCalls.map((tc, i) => (
                  <div key={i}>
                    <span className="font-semibold text-foreground/70">{tc.name}</span>
                    <pre className="mt-0.5 text-[10px] leading-relaxed whitespace-pre-wrap break-all">{JSON.stringify(tc.arguments, null, 2)}</pre>
                    <ToolCallSql toolCall={tc} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isLatest && message.suggestedChips && message.suggestedChips.length > 0 && (
          <SuggestedChips chips={message.suggestedChips} />
        )}
      </div>
    </div>
  );
}

function RichBlockRenderer({ block }: { block: RichBlock }) {
  switch (block.type) {
    case "stat-cards":
      return <StatCardGrid data={block.data as Parameters<typeof StatCardGrid>[0]["data"]} />;
    case "data-table":
      return <DataTableBlock data={block.data as Parameters<typeof DataTableBlock>[0]["data"]} />;
    case "pipeline-board":
      return <PipelineBoard data={block.data as Parameters<typeof PipelineBoard>[0]["data"]} />;
    case "activity-timeline":
      return <ActivityTimeline data={block.data as Activity[]} />;
    case "contact-card":
      return <ContactCard data={block.data as Parameters<typeof ContactCard>[0]["data"]} />;
    case "deal-summary":
      return <DealSummary data={block.data as Parameters<typeof DealSummary>[0]["data"]} />;
    case "action-buttons":
      return <ActionButtons data={block.data as Parameters<typeof ActionButtons>[0]["data"]} />;
    case "inline-form":
      return <InlineForm data={block.data as Parameters<typeof InlineForm>[0]["data"]} />;
    case "email-list":
      return <EmailList data={block.data as Parameters<typeof EmailList>[0]["data"]} />;
    case "email-detail":
      return <EmailDetail data={block.data as Parameters<typeof EmailDetail>[0]["data"]} />;
    case "email-compose":
      return <EmailCompose data={block.data as Parameters<typeof EmailCompose>[0]["data"]} />;
    case "integration-status":
      return <IntegrationStatus data={block.data as Parameters<typeof IntegrationStatus>[0]["data"]} />;
    case "sms-thread":
      return <SmsThread data={block.data as Parameters<typeof SmsThread>[0]["data"]} />;
    case "sms-compose":
      return <SmsCompose data={block.data as Parameters<typeof SmsCompose>[0]["data"]} />;
    case "dynamic-ui":
      return <DynamicUI data={block.data as Parameters<typeof DynamicUI>[0]["data"]} />;
    case "attachment-list":
      return <AttachmentList data={block.data as Parameters<typeof AttachmentList>[0]["data"]} />;
    case "task-list":
      return <TaskList data={block.data as Parameters<typeof TaskList>[0]["data"]} />;
    case "calendar-events":
      return <CalendarEvents data={block.data as CalendarEventsData} />;
    default:
      return null;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}
