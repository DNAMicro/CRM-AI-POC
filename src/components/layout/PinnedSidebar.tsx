"use client";

import type { PinnedItem, RichBlock, DynamicUIData, StatCard, DataTableData } from "@/types/conversation";
import { useDetailPanelState, useDetailPanelActions } from "@/hooks/useDetailPanel";
import { X, Maximize2, Pin } from "lucide-react";

export function PinnedSidebar() {
  const { pinnedItems } = useDetailPanelState();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Pin className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="font-semibold text-foreground text-sm">Pinned</h2>
          {pinnedItems.length > 0 && (
            <span className="text-[10px] font-semibold bg-accent text-accent-foreground px-1.5 py-0.5 rounded-md">
              {pinnedItems.length}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {pinnedItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center p-6 h-full">
            <p className="text-[12px] text-muted-foreground/40 leading-relaxed">
              Pin items from chat to<br />keep them visible
            </p>
          </div>
        ) : (
          pinnedItems.map((item) => (
            <PinnedCard key={item.id} item={item} />
          ))
        )}
      </div>
    </div>
  );
}

function PinnedCard({ item }: { item: PinnedItem }) {
  const { unpinBlock, expandBlock } = useDetailPanelActions();

  return (
    <div className="glass-card rounded-xl p-3 group/pin">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-foreground/80 truncate flex-1">
          {getBlockTitle(item.block)}
        </span>
        <div className="flex gap-1 opacity-0 group-hover/pin:opacity-100 transition-opacity">
          <button
            onClick={() => expandBlock(item.block)}
            className="w-5 h-5 rounded flex items-center justify-center hover:bg-accent transition-colors"
            title="Expand"
          >
            <Maximize2 className="w-3 h-3 text-muted-foreground" />
          </button>
          <button
            onClick={() => unpinBlock(item.id)}
            className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-50 transition-colors"
            title="Unpin"
          >
            <X className="w-3 h-3 text-muted-foreground hover:text-red-500" />
          </button>
        </div>
      </div>
      <div className="cursor-pointer" onClick={() => expandBlock(item.block)}>
        <CompactBlockView block={item.block} />
      </div>
    </div>
  );
}

function CompactBlockView({ block }: { block: RichBlock }) {
  switch (block.type) {
    case "stat-cards":
      return <CompactStatCards data={block.data as StatCard[]} />;
    case "data-table":
      return <CompactDataTable data={block.data as DataTableData} />;
    case "dynamic-ui":
      return <CompactDynamicUI data={block.data as DynamicUIData} />;
    case "pipeline-board":
      return <CompactPipelineBoard data={block.data as { stage: string; deals: unknown[] }[]} />;
    default:
      return (
        <p className="text-[11px] text-muted-foreground">
          {block.type.replace(/-/g, " ")}
        </p>
      );
  }
}

function CompactStatCards({ data }: { data: StatCard[] }) {
  if (!Array.isArray(data) || data.length === 0) return null;
  return (
    <div className="space-y-1">
      {data.slice(0, 3).map((card, i) => (
        <div key={i} className="flex justify-between items-baseline">
          <span className="text-[11px] text-muted-foreground truncate">{card.label}</span>
          <span className="text-[12px] font-semibold text-foreground tabular-nums ml-2">{card.value}</span>
        </div>
      ))}
      {data.length > 3 && (
        <span className="text-[10px] text-muted-foreground/50">+{data.length - 3} more</span>
      )}
    </div>
  );
}

function CompactDataTable({ data }: { data: DataTableData }) {
  return (
    <p className="text-[12px] text-muted-foreground">
      <span className="font-semibold text-foreground">{data.rows?.length || 0}</span> rows
      {data.entityType && <span> &middot; {data.entityType}s</span>}
    </p>
  );
}

function CompactDynamicUI({ data }: { data: DynamicUIData }) {
  // If the layout root is a chart, render it small
  if (data.layout?.type === "chart") {
    return (
      <p className="text-[12px] text-muted-foreground">
        {(data.layout as { chartType?: string }).chartType || "chart"} &middot; {data.title || "Dynamic view"}
      </p>
    );
  }
  // If it's a stack/grid with children, summarize
  if ("children" in data.layout && Array.isArray((data.layout as { children?: unknown[] }).children)) {
    const children = (data.layout as { children: { type: string }[] }).children;
    const types = [...new Set(children.map((c) => c.type))];
    return (
      <p className="text-[12px] text-muted-foreground">
        {types.join(", ")} &middot; {children.length} items
      </p>
    );
  }
  return <p className="text-[12px] text-muted-foreground">{data.title || "Dynamic view"}</p>;
}

function CompactPipelineBoard({ data }: { data: { stage: string; deals: unknown[] }[] }) {
  if (!Array.isArray(data)) return null;
  const totalDeals = data.reduce((sum, col) => sum + (col.deals?.length || 0), 0);
  return (
    <p className="text-[12px] text-muted-foreground">
      <span className="font-semibold text-foreground">{totalDeals}</span> deals across{" "}
      <span className="font-semibold text-foreground">{data.length}</span> stages
    </p>
  );
}

function getBlockTitle(block: RichBlock): string {
  switch (block.type) {
    case "stat-cards": return "Stats Overview";
    case "data-table": {
      const d = block.data as DataTableData;
      return d.entityType ? `${d.entityType}s` : "Data Table";
    }
    case "pipeline-board": return "Pipeline Board";
    case "activity-timeline": return "Activity Timeline";
    case "contact-card": return "Contact Card";
    case "deal-summary": return "Deal Summary";
    case "dynamic-ui": return (block.data as DynamicUIData)?.title || "Dynamic View";
    case "attachment-list": return "Attachments";
    default: return block.type.replace(/-/g, " ");
  }
}
