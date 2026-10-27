"use client";

import { useEffect, useRef, useState } from "react";
import { useConversationState, useConversationActions } from "@/hooks/useConversation";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";
import { Bot, Zap, Loader2 } from "lucide-react";

export function ConversationPanel() {
  const { messages, isTyping } = useConversationState();
  const { initGreeting } = useConversationActions();
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initGreeting().finally(() => setLoading(false));
      // Safety timeout — if initGreeting hangs, stop loading after 5s
      const timeout = setTimeout(() => setLoading(false), 5000);
      return () => clearTimeout(timeout);
    }
  }, [initGreeting]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  return (
    <div className="flex-1 flex flex-col h-screen min-w-0">
      {/* Header */}
      <div className="glass-panel border-t-0 border-l-0 border-r-0 px-6 py-3.5 flex items-center justify-between shadow-[0_1px_3px_oklch(0.2_0.02_265/0.04)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-glass ring-1 ring-white/20">
            <Bot className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground leading-none tracking-tight">CRM Assistant</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ring-2 ring-emerald-500/20" />
              <span className="text-xs text-muted-foreground">Online</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-primary/[0.05] to-violet-500/[0.05] border border-primary/[0.08]">
          <Zap className="w-3 h-3 text-primary/50" />
          <span className="text-[10.5px] font-medium text-primary/60">AI Powered</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-6 chat-bg">
        <div className="max-w-4xl mx-auto px-2">
          {loading && messages.length === 0 && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-muted-foreground/60 animate-spin" />
            </div>
          )}
          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-5 shadow-glass-lg">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <p className="text-base font-semibold text-foreground mb-1.5">How can I help you today?</p>
              <p className="text-sm text-muted-foreground">Ask about your pipeline, contacts, deals, or tasks.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={msg.id} message={msg} isLatest={i === messages.length - 1 && !isTyping} />
          ))}
          {isTyping && <TypingIndicator />}
        </div>
      </div>

      {/* Input */}
      <MessageInput />
    </div>
  );
}
