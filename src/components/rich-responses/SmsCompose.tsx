"use client";

import { useState } from "react";
import type { SmsComposeData } from "@/types/conversation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Send, X, MessageSquare } from "lucide-react";

interface Props {
  data: SmsComposeData;
}

export function SmsCompose({ data }: Props) {
  const [to] = useState(data.to);
  const [body, setBody] = useState(data.body || "");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error" | "dismissed">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSend = async () => {
    if (!body.trim()) {
      setStatus("error");
      setErrorMsg("Message body is required");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          body: body.trim(),
          contactId: data.contactId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send SMS");
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to send SMS");
    }
  };

  if (status === "dismissed") return null;

  if (status === "success") {
    return (
      <div className="my-4 glass-card rounded-xl p-5 border-emerald-300/40 dark:border-emerald-800/30 bg-emerald-50/30 dark:bg-emerald-950/20">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">SMS sent successfully!</span>
            <p className="text-[12px] text-emerald-600 mt-0.5">
              To: {data.toName || to}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const baseClass = "w-full px-3 py-2.5 text-[13px] bg-background/80 border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:bg-muted/50 transition-all placeholder:text-muted-foreground/50";

  return (
    <div className="my-4 glass-card rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Send SMS</h3>
          <Badge variant="outline" className="text-[10px]">Text</Badge>
        </div>
        <button
          onClick={() => setStatus("dismissed")}
          className="p-1 rounded-lg hover:bg-accent/80 transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* To field */}
      <div className="mb-3">
        <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">To</label>
        <div className="flex items-center gap-2 px-3 py-2 glass-surface rounded-xl">
          {data.toName && <span className="text-[13px] font-medium text-foreground">{data.toName}</span>}
          <span className="text-[11px] text-muted-foreground">{to}</span>
        </div>
      </div>

      {/* Message */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Message</label>
          <span className={`text-[10px] tabular-nums ${body.length > 160 ? "text-amber-600 font-medium" : "text-muted-foreground/50"}`}>
            {body.length}/160
          </span>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={status === "submitting"}
          placeholder="Type your message..."
          rows={3}
          className={baseClass + " resize-none"}
        />
        {body.length > 160 && (
          <p className="text-[10px] text-amber-600 mt-1">
            Message exceeds 160 characters — will be sent as {Math.ceil(body.length / 160)} segments
          </p>
        )}
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
          {status === "submitting" ? "Sending..." : "Send SMS"}
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
