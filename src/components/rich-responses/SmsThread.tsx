"use client";

import { useState } from "react";
import type { SmsThreadData } from "@/types/conversation";
import { MessageSquare, Send, Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  data: SmsThreadData;
}

export function SmsThread({ data }: Props) {
  const { contactName, contactPhone, messages } = data;
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSendReply = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: contactPhone,
          body: replyText.trim(),
          contactId: data.contactId,
        }),
      });
      if (res.ok) {
        setSent(true);
        setReplyText("");
        setTimeout(() => setSent(false), 3000);
      }
    } catch {
      // Error handled silently
    } finally {
      setSending(false);
    }
  };

  // Group messages by date for date separators
  const groupedMessages: { date: string; messages: typeof messages }[] = [];
  let currentDate = "";
  for (const msg of messages) {
    const date = new Date(msg.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    if (date !== currentDate) {
      currentDate = date;
      groupedMessages.push({ date, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  }

  return (
    <div className="my-4 glass-card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-emerald-700" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-foreground">{contactName}</p>
          <p className="text-[11px] text-muted-foreground">{contactPhone}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="px-4 py-3 max-h-[400px] overflow-y-auto space-y-1">
        {messages.length === 0 ? (
          <p className="text-center text-[13px] text-muted-foreground py-6">No messages yet</p>
        ) : (
          groupedMessages.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex justify-center my-3">
                <span className="text-[10px] text-muted-foreground/60 bg-muted/60 px-3 py-1 rounded-full">
                  {group.date}
                </span>
              </div>

              {group.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex mb-2 ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] px-4 py-2.5 ${
                      msg.direction === "outbound"
                        ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-2xl rounded-br-lg shadow-glass"
                        : "glass-surface rounded-2xl rounded-bl-lg text-foreground/80"
                    }`}
                  >
                    <p className="text-[13px] leading-relaxed">{msg.body}</p>
                    <div className={`flex items-center gap-1 mt-1 ${msg.direction === "outbound" ? "justify-end" : ""}`}>
                      <span className={`text-[10px] ${msg.direction === "outbound" ? "text-white/60" : "text-muted-foreground/50"}`}>
                        {new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                      {msg.direction === "outbound" && msg.status && (
                        <span className="text-[9px] text-white/50 capitalize">{msg.status}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Quick reply */}
      <div className="px-4 py-3 border-t border-border/30 bg-muted/10">
        {sent ? (
          <div className="flex items-center gap-2 text-[12px] text-emerald-600 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Message sent!
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
              placeholder="Type a reply..."
              disabled={sending}
              className="flex-1 px-3 py-2 text-[13px] bg-background/80 border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 placeholder:text-muted-foreground/50 transition-all"
            />
            <button
              onClick={handleSendReply}
              disabled={!replyText.trim() || sending}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-glass disabled:opacity-50 disabled:cursor-not-allowed hover:from-indigo-600 hover:to-violet-700 transition-all active:scale-95"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
            <span className={`text-[10px] tabular-nums flex-shrink-0 ${replyText.length > 160 ? "text-amber-600" : "text-muted-foreground/50"}`}>
              {replyText.length}/160
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
