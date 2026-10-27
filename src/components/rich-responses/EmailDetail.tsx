"use client";

import { useState } from "react";
import { useConversationActions } from "@/hooks/useConversation";
import type { EmailDetailData } from "@/types/conversation";
import { formatRelativeDate } from "@/lib/format";
import { Reply, Forward, User, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import DOMPurify from "dompurify";

interface Props {
  data: EmailDetailData;
}

function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "b", "i", "u", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "pre", "code", "span", "div", "table", "tr", "td", "th", "thead", "tbody", "img"],
    ALLOWED_ATTR: ["href", "target", "style", "class", "src", "alt", "width", "height"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover"],
  });
}

export function EmailDetail({ data }: Props) {
  const { triggerIntent } = useConversationActions();
  const [showThread, setShowThread] = useState(false);
  const hasThread = data.thread && data.thread.length > 0;

  return (
    <div className="my-4 glass-card rounded-xl p-5">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-indigo-700">
            {(data.direction === "inbound" ? data.fromAddress : data.toAddress).charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-foreground">
              {data.direction === "inbound" ? (data.contactName || data.fromAddress) : `To: ${data.contactName || data.toAddress}`}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {data.direction === "inbound" ? data.fromAddress : data.toAddress}
            {data.ccAddress && ` \u00b7 CC: ${data.ccAddress}`}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {formatRelativeDate(data.sentAt)}
          </p>
        </div>
      </div>

      {/* Subject */}
      <h3 className="text-[15px] font-semibold text-foreground mb-4">{data.subject || "(no subject)"}</h3>

      <div className="border-t border-border/40 my-4" />

      {/* Body */}
      <div
        className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground/80 [&_a]:text-indigo-600 [&_a]:underline [&_img]:max-w-full [&_img]:rounded-lg"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.bodyHtml || data.subject) }}
      />

      {/* Thread */}
      {hasThread && (
        <div className="mt-4">
          <button
            onClick={() => setShowThread(!showThread)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            {showThread ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {data.thread!.length} earlier message{data.thread!.length !== 1 ? "s" : ""} in thread
          </button>

          {showThread && (
            <div className="mt-3 space-y-3">
              {data.thread!.map((msg) => (
                <div key={msg.id} className="glass-surface rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-medium text-foreground/70">
                      {msg.direction === "inbound" ? (msg.contactName || msg.fromAddress) : `You \u2192 ${msg.contactName || msg.toAddress}`}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{formatRelativeDate(msg.sentAt)}</span>
                  </div>
                  <div
                    className="text-[12px] text-foreground/60 leading-relaxed [&_a]:text-indigo-600"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.bodyHtml || "") }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-5 pt-4 border-t border-border/30">
        <Button
          size="sm"
          className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-glass border-0 gap-1.5 rounded-xl"
          onClick={() => triggerIntent("compose-email", { contactId: data.contactId, inReplyTo: data.gmailMessageId, threadId: data.gmailThreadId, __chipLabel: `Reply to: ${data.subject}` })}
        >
          <Reply className="w-3.5 h-3.5" />
          Reply
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-xl"
          onClick={() => triggerIntent("forward-email", { emailId: data.id, __chipLabel: `Forward: ${data.subject}` })}
        >
          <Forward className="w-3.5 h-3.5" />
          Forward
        </Button>
        {data.contactId && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-xl"
            onClick={() => triggerIntent("contact-detail", { contactId: data.contactId!, __chipLabel: "View contact" })}
          >
            <User className="w-3.5 h-3.5" />
            View Contact
          </Button>
        )}
      </div>
    </div>
  );
}
