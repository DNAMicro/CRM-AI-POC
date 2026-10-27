"use client";

import type { AttachmentListData } from "@/types/conversation";
import { FileText, Image, FileSpreadsheet, File, Download } from "lucide-react";

interface Props {
  data: AttachmentListData;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return { Icon: Image, bg: "bg-emerald-100", color: "text-emerald-700" };
  if (mimeType.includes("pdf")) return { Icon: FileText, bg: "bg-red-100", color: "text-red-600" };
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return { Icon: FileSpreadsheet, bg: "bg-green-100", color: "text-green-700" };
  return { Icon: File, bg: "bg-indigo-100", color: "text-indigo-600" };
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AttachmentList({ data }: Props) {
  if (!data.attachments || data.attachments.length === 0) return null;

  return (
    <div className="my-4 glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.06em]">
          Attached Files
        </p>
        <span className="text-[11px] text-muted-foreground">
          {data.attachments.length} {data.attachments.length === 1 ? "file" : "files"}
        </span>
      </div>

      <div className="space-y-1.5">
        {data.attachments.map((att) => {
          const { Icon, bg, color } = getFileIcon(att.mimeType);
          return (
            <div
              key={att.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 transition-colors"
            >
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground/85 truncate">{att.filename}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-muted-foreground">{formatFileSize(att.size)}</span>
                  <span className="text-[11px] text-muted-foreground">&middot;</span>
                  <span className="text-[11px] text-muted-foreground">{formatDate(att.uploadedAt)}</span>
                  {att.contactName && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                      Contact: {att.contactName}
                    </span>
                  )}
                  {att.dealName && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                      Deal: {att.dealName}
                    </span>
                  )}
                </div>
              </div>
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg border border-border/50 flex items-center justify-center hover:bg-accent transition-colors flex-shrink-0"
                title="Download"
              >
                <Download className="w-3.5 h-3.5 text-muted-foreground" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
