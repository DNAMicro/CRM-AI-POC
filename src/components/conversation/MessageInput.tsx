"use client";

import { useState, useCallback, useRef, type KeyboardEvent } from "react";
import { useConversationActions } from "@/hooks/useConversation";
import { SendHorizonal, Paperclip, X, FileText } from "lucide-react";
import { SlashCommandMenu } from "@/components/conversation/SlashCommandMenu";
import type { SlashCommand, FileAttachment } from "@/types/conversation";

interface PendingFile {
  file: File;
  status: "pending" | "uploading" | "uploaded" | "error";
  attachment?: FileAttachment;
  error?: string;
}

export function MessageInput() {
  const [text, setText] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage, triggerIntent } = useConversationActions();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: PendingFile[] = Array.from(files).map((file) => {
      if (file.size > 10 * 1024 * 1024) {
        return { file, status: "error" as const, error: "File too large (max 10MB)" };
      }
      return { file, status: "pending" as const };
    });

    setPendingFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (): Promise<FileAttachment[]> => {
    const toUpload = pendingFiles.filter((f) => f.status === "pending");
    if (toUpload.length === 0) {
      return pendingFiles.filter((f) => f.status === "uploaded" && f.attachment).map((f) => f.attachment!);
    }

    setIsUploading(true);
    const results: FileAttachment[] = [];

    for (let i = 0; i < pendingFiles.length; i++) {
      const pf = pendingFiles[i];
      if (pf.status !== "pending") {
        if (pf.status === "uploaded" && pf.attachment) results.push(pf.attachment);
        continue;
      }

      setPendingFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" as const } : f))
      );

      try {
        const formData = new FormData();
        formData.append("file", pf.file);
        const res = await fetch("/api/files/upload", { method: "POST", body: formData });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Upload failed");
        }
        const attachment: FileAttachment = await res.json();
        results.push(attachment);
        setPendingFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: "uploaded" as const, attachment } : f))
        );
      } catch (err) {
        setPendingFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: "error" as const, error: String(err) } : f))
        );
      }
    }

    setIsUploading(false);
    return results;
  };

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    const hasFiles = pendingFiles.some((f) => f.status === "pending" || f.status === "uploaded");

    if (!trimmed && !hasFiles) return;

    let attachments: FileAttachment[] | undefined;
    if (hasFiles) {
      attachments = await uploadFiles();
      if (attachments.length === 0) return; // all failed
    }

    const message = trimmed || `Uploaded ${attachments?.map((a) => a.filename).join(", ")}`;
    sendMessage(message, attachments);
    setText("");
    setPendingFiles([]);
    setShowSlashMenu(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, pendingFiles, sendMessage]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);
    if (val.startsWith("/") && val.length > 0) {
      setShowSlashMenu(true);
    } else {
      setShowSlashMenu(false);
    }
  };

  const handleSlashSelect = useCallback(
    (command: SlashCommand) => {
      if (command.intent) {
        triggerIntent(command.intent, { __chipLabel: command.label });
        setText("");
        setShowSlashMenu(false);
      } else if (command.promptTemplate) {
        setText(command.promptTemplate);
        setShowSlashMenu(false);
      }
    },
    [triggerIntent]
  );

  const handleSlashClose = () => {
    setShowSlashMenu(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showSlashMenu) {
      if (e.key === "Enter" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Escape") {
        e.preventDefault();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  return (
    <div className="glass-panel border-b-0 border-l-0 border-r-0 px-6 py-4 shadow-[0_-1px_3px_oklch(0.2_0.02_265/0.03)]">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-11 h-11 rounded-xl border border-border/50 bg-background/50 flex items-center justify-center hover:bg-accent/70 hover:border-primary/25 active:scale-95 transition-all flex-shrink-0"
            title="Attach file"
          >
            <Paperclip className="w-4 h-4 text-muted-foreground/70" />
          </button>
          <div className="flex-1 relative">
            {showSlashMenu && (
              <SlashCommandMenu
                filter={text.slice(1)}
                onSelect={handleSlashSelect}
                onClose={handleSlashClose}
              />
            )}
            <input
              type="text"
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your pipeline, contacts, deals, follow-ups..."
              className="w-full pl-5 pr-5 py-3.5 text-base bg-background/70 border border-border/60 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 placeholder:text-muted-foreground shadow-glass transition-all"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!text.trim() && !pendingFiles.some((f) => f.status === "pending" || f.status === "uploaded")}
            className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-white flex items-center justify-center shadow-glass hover:shadow-glass-lg active:scale-95 transition-all"
          >
            <SendHorizonal className="w-4 h-4" />
          </button>
        </div>

        {pendingFiles.length > 0 && (
          <div className="flex gap-2 mt-3 flex-wrap ml-14">
            {pendingFiles.map((pf, i) => (
              <div
                key={i}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border ${
                  pf.status === "error"
                    ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800/40 dark:text-red-400"
                    : pf.status === "uploading"
                    ? "bg-muted/50 border-border/40 text-muted-foreground animate-pulse"
                    : "bg-muted/30 border-border/40 text-foreground/80"
                }`}
              >
                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-medium truncate max-w-[150px]">{pf.file.name}</span>
                <span className="text-[11px] opacity-50">{formatSize(pf.file.size)}</span>
                <button
                  onClick={() => removeFile(i)}
                  className="w-4 h-4 rounded-full bg-muted/60 hover:bg-red-100 dark:hover:bg-red-950/40 flex items-center justify-center ml-0.5"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
