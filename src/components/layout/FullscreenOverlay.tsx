"use client";

import { useEffect, useCallback } from "react";
import { useDetailPanelState, useDetailPanelActions } from "@/hooks/useDetailPanel";
import type { RichBlock } from "@/types/conversation";
import type { Activity } from "@/types/crm";
import { X } from "lucide-react";

import { StatCardGrid } from "@/components/rich-responses/StatCardGrid";
import { DataTableBlock } from "@/components/rich-responses/DataTable";
import { PipelineBoard } from "@/components/rich-responses/PipelineBoard";
import { ActivityTimeline } from "@/components/rich-responses/ActivityTimeline";
import { ContactCard } from "@/components/rich-responses/ContactCard";
import { DealSummary } from "@/components/rich-responses/DealSummary";
import { EmailList } from "@/components/rich-responses/EmailList";
import { EmailDetail } from "@/components/rich-responses/EmailDetail";
import { IntegrationStatus } from "@/components/rich-responses/IntegrationStatus";
import { DynamicUI } from "@/components/rich-responses/DynamicUI";
import { AttachmentList } from "@/components/rich-responses/AttachmentList";

export function FullscreenOverlay() {
  const { fullscreenBlock } = useDetailPanelState();
  const { closeFullscreen } = useDetailPanelActions();

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") closeFullscreen();
  }, [closeFullscreen]);

  useEffect(() => {
    if (fullscreenBlock) {
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [fullscreenBlock, handleEsc]);

  if (!fullscreenBlock) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "oklch(0.1 0.02 265 / 0.5)", backdropFilter: "blur(4px)" }}
      onClick={closeFullscreen}
    >
      <div
        className="glass-card rounded-2xl p-6 w-[90vw] max-w-[950px] max-h-[85vh] overflow-y-auto relative"
        style={{ boxShadow: "0 8px 48px oklch(0.1 0.02 265 / 0.25), 0 2px 12px oklch(0.1 0.02 265 / 0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={closeFullscreen}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg border border-border/50 bg-background/90 flex items-center justify-center hover:bg-accent transition-colors z-10"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="mt-2">
          <FullscreenBlockRenderer block={fullscreenBlock} />
        </div>
      </div>
    </div>
  );
}

function FullscreenBlockRenderer({ block }: { block: RichBlock }) {
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
    case "email-list":
      return <EmailList data={block.data as Parameters<typeof EmailList>[0]["data"]} />;
    case "email-detail":
      return <EmailDetail data={block.data as Parameters<typeof EmailDetail>[0]["data"]} />;
    case "integration-status":
      return <IntegrationStatus data={block.data as Parameters<typeof IntegrationStatus>[0]["data"]} />;
    case "dynamic-ui":
      return <DynamicUI data={block.data as Parameters<typeof DynamicUI>[0]["data"]} />;
    case "attachment-list":
      return <AttachmentList data={block.data as Parameters<typeof AttachmentList>[0]["data"]} />;
    default:
      return <p className="text-muted-foreground">Unsupported block type</p>;
  }
}
