"use client";

import { useState } from "react";
import type { EmailComposeData } from "@/types/conversation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Send, Type, X } from "lucide-react";
import { RichTextEditor } from "@/components/editor/RichTextEditor";

interface Props {
  data: EmailComposeData;
}

export function EmailCompose({ data }: Props) {
  const [to, setTo] = useState(data.to);
  const [subject, setSubject] = useState(data.subject);
  const [bodyHtml, setBodyHtml] = useState(data.bodyHtml);
  const [cc, setCc] = useState(data.cc || "");
  const [showCc, setShowCc] = useState(Boolean(data.cc));
  const [showToolbar, setShowToolbar] = useState(true);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error" | "dismissed">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSend = async () => {
    if (!to.trim()) {
      setStatus("error");
      setErrorMsg("Recipient email is required");
      return;
    }
    if (!subject.trim()) {
      setStatus("error");
      setErrorMsg("Subject is required");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          bodyHtml,
          bodyText: bodyHtml.replace(/<[^>]*>/g, ""),
          cc: cc || undefined,
          contactId: data.contactId,
          inReplyTo: data.inReplyTo,
          threadId: data.threadId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send email");
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to send email");
    }
  };

  if (status === "dismissed") return null;

  if (status === "success") {
    return (
      <div className="my-4 glass-card rounded-xl p-5 border-emerald-300/40 dark:border-emerald-800/30 bg-emerald-50/30 dark:bg-emerald-950/20">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Email sent successfully!</span>
            <p className="text-[12px] text-emerald-600 mt-0.5">
              To: {data.toName || to} &middot; {subject}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const baseClass = "w-full px-3 py-2.5 text-[13px] bg-background/80 border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:bg-muted/50 transition-all placeholder:text-muted-foreground/50";

  const modeLabel = data.mode === "reply" ? "Reply" : data.mode === "forward" ? "Forward" : "New";

  return (
    <div className="my-4 glass-card rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Compose Email</h3>
          <Badge variant="outline" className="text-[10px]">{modeLabel}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowToolbar(!showToolbar)}
            className={`p-1 rounded-lg transition-colors ${showToolbar ? "bg-primary/10 text-primary" : "hover:bg-accent/80 text-muted-foreground"}`}
            title={showToolbar ? "Hide formatting" : "Show formatting"}
          >
            <Type className="w-4 h-4" />
          </button>
          <button
            onClick={() => setStatus("dismissed")}
            className="p-1 rounded-lg hover:bg-accent/80 transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* To field */}
      <div className="mb-3">
        <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">To</label>
        {data.toName ? (
          <div className="flex items-center gap-2 px-3 py-2 glass-surface rounded-xl">
            <span className="text-[13px] font-medium text-foreground">{data.toName}</span>
            <span className="text-[11px] text-muted-foreground">{to}</span>
          </div>
        ) : (
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={status === "submitting"}
            placeholder="recipient@example.com"
            className={baseClass}
          />
        )}
      </div>

      {/* CC toggle */}
      {!showCc ? (
        <button
          onClick={() => setShowCc(true)}
          className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium mb-3 block"
        >
          + Add CC/BCC
        </button>
      ) : (
        <div className="mb-3">
          <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">CC</label>
          <input
            type="email"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            disabled={status === "submitting"}
            placeholder="cc@example.com"
            className={baseClass}
          />
        </div>
      )}

      {/* Subject */}
      <div className="mb-3">
        <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={status === "submitting"}
          placeholder="Email subject"
          className={baseClass}
        />
      </div>

      {/* Body — Rich text editor */}
      <div className="mb-3">
        <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">Body</label>
        <RichTextEditor
          initialContent={bodyHtml}
          onChange={setBodyHtml}
          placeholder="Write your email..."
          showToolbar={showToolbar}
          disabled={status === "submitting"}
        />
      </div>

      {/* Error */}
      {status === "error" && (
        <p className="text-[12px] text-red-600 mt-1 font-medium">{errorMsg}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-5 pt-4 border-t border-border/30">
        <Button
          onClick={handleSend}
          disabled={status === "submitting"}
          size="sm"
          className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-glass border-0 gap-1.5 rounded-xl"
        >
          {status === "submitting" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {status === "submitting" ? "Sending..." : "Send Email"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => setStatus("dismissed")}
          disabled={status === "submitting"}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
