"use client";

import { useConversationActions } from "@/hooks/useConversation";
import type { EmailListData } from "@/types/conversation";
import { Mail, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { formatRelativeDate } from "@/lib/format";

interface Props {
  data: EmailListData;
}

export function EmailList({ data }: Props) {
  const { triggerIntent } = useConversationActions();
  const { emails, totalCount, unreadCount, page, pageSize, hasMore } = data;

  if (emails.length === 0) {
    return (
      <div className="my-4 glass-card rounded-xl p-8 text-center">
        <Inbox className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No emails found</p>
      </div>
    );
  }

  return (
    <div className="my-4 glass-card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Inbox</span>
        </div>
        {unreadCount > 0 && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
            {unreadCount} unread
          </span>
        )}
      </div>

      {/* Email rows */}
      <div className="divide-y divide-border/20">
        {emails.map((email) => (
          <button
            key={email.id}
            onClick={() => triggerIntent("view-email-thread", { threadId: email.gmailThreadId, __chipLabel: `Email: ${email.subject}` })}
            className="w-full text-left px-4 py-3 hover:bg-primary/[0.04] transition-colors group flex items-start gap-3"
          >
            {/* Unread dot */}
            <div className="pt-1.5 w-3 flex-shrink-0">
              {!email.isRead && (
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[13px] truncate ${!email.isRead ? "font-semibold text-foreground" : "font-medium text-foreground/70"}`}>
                  {email.direction === "inbound" ? (email.contactName || email.fromAddress) : `To: ${email.contactName || email.toAddress}`}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                  {formatRelativeDate(email.sentAt)}
                </span>
              </div>
              <p className={`text-[13px] truncate ${!email.isRead ? "text-foreground/80" : "text-foreground/60"}`}>
                {email.subject || "(no subject)"}
              </p>
              <p className="text-[12px] text-muted-foreground/60 truncate mt-0.5">
                {email.bodyPreview}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Pagination footer */}
      <div className="px-4 py-2.5 border-t border-border/30 bg-muted/20 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {totalCount} email{totalCount !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            className="p-1 rounded-lg hover:bg-accent/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            Page {page} of {Math.ceil(totalCount / pageSize)}
          </span>
          <button
            disabled={!hasMore}
            className="p-1 rounded-lg hover:bg-accent/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}
