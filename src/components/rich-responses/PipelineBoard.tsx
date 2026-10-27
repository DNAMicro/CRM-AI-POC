"use client";

import { useState } from "react";
import type { PipelineStage } from "@/types/crm";
import { STAGE_DOT_COLORS, PRIORITY_DOT_COLORS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import { useDetailPanelActions } from "@/hooks/useDetailPanel";
import { useConversationActions } from "@/hooks/useConversation";
import { TONES, STAGE_TONES, isOverdue } from "./card-parts";

interface DealCard {
  id: string;
  name: string;
  company: string;
  value: number;
  closeDate: string;
  priority: string;
}

interface BoardColumn {
  stage: PipelineStage;
  label: string;
  deals: DealCard[];
  totalValue: number;
}

interface Props {
  data: BoardColumn[];
}

export function PipelineBoard({ data: initialData }: Props) {
  const { openPanel } = useDetailPanelActions();
  const { triggerIntent } = useConversationActions();
  const [data, setData] = useState(initialData);
  const [dragDealId, setDragDealId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const handleDealClick = (dealId: string, company: string) => {
    openPanel("deal", dealId);
    triggerIntent("deal-detail", { dealId, __chipLabel: `Details: ${company}` });
  };

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    setDragDealId(dealId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dealId);
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStage: PipelineStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const dealId = e.dataTransfer.getData("text/plain") || dragDealId;
    if (!dealId) return;

    // Find the deal's current stage
    let sourceStage: string | null = null;
    for (const col of data) {
      if (col.deals.some(d => d.id === dealId)) {
        sourceStage = col.stage;
        break;
      }
    }
    if (sourceStage === targetStage) { setDragDealId(null); return; }

    // Optimistic UI update
    setData(prev => {
      const next = prev.map(col => ({
        ...col,
        deals: col.stage === sourceStage
          ? col.deals.filter(d => d.id !== dealId)
          : col.stage === targetStage
          ? [...col.deals, prev.find(c => c.stage === sourceStage)!.deals.find(d => d.id === dealId)!]
          : col.deals,
      }));
      // Recalculate totals
      return next.map(col => ({ ...col, totalValue: col.deals.reduce((s, d) => s + d.value, 0) }));
    });
    setDragDealId(null);

    // Persist to backend
    try {
      await fetch(`/api/deals/${dealId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: targetStage }),
      });
    } catch {
      // Revert on failure
      setData(initialData);
    }
  };

  return (
    <div className="my-4 flex gap-3 overflow-x-auto pb-3">
      {data.map((col) => (
        <div
          key={col.stage}
          className={`min-w-[210px] flex-1 glass-surface rounded-xl overflow-hidden border transition-colors ${
            dragOverStage === col.stage ? "border-primary/50 bg-primary/[0.03]" : "border-border/40"
          }`}
          onDragOver={(e) => handleDragOver(e, col.stage)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, col.stage)}
        >
          <div className={`h-1 ${STAGE_DOT_COLORS[col.stage]}`} />
          <div className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-background ${STAGE_DOT_COLORS[col.stage]}`} />
              <span className="text-[13px] font-semibold text-foreground">{col.label}</span>
              <span className="text-[11px] font-medium text-muted-foreground ml-auto bg-muted/60 px-1.5 py-0.5 rounded-md">{col.deals.length}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3 ml-[18px]">{formatCurrency(col.totalValue)}</p>

            <div className="space-y-2">
              {col.deals.map((deal) => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, deal.id)}
                  onDragEnd={() => { setDragDealId(null); setDragOverStage(null); }}
                  className={`w-full text-left rounded-xl border p-3 ${TONES[STAGE_TONES[col.stage]].tile} hover:shadow-glass-lg active:scale-[0.98] transition-all cursor-grab active:cursor-grabbing ${
                    dragDealId === deal.id ? "opacity-40" : ""
                  }`}
                >
                  <button
                    onClick={() => handleDealClick(deal.id, deal.company)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[13px] font-semibold text-foreground leading-snug">{deal.company}</span>
                      <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ring-1 ring-white dark:ring-background ${PRIORITY_DOT_COLORS[deal.priority as keyof typeof PRIORITY_DOT_COLORS] || "bg-slate-300"}`} />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 truncate">{deal.name}</p>
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/40">
                      <span className={`text-[13px] font-bold tabular-nums ${TONES[STAGE_TONES[col.stage]].value}`}>{formatCurrency(deal.value)}</span>
                      {isOverdue(deal.closeDate, col.stage) ? (
                        <span className="text-[11px] font-medium text-red-600 dark:text-red-400 tabular-nums" title="Close date has passed">
                          {formatDate(deal.closeDate)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground tabular-nums">{formatDate(deal.closeDate)}</span>
                      )}
                    </div>
                  </button>
                </div>
              ))}
              {col.deals.length === 0 && (
                <p className="text-[11px] text-muted-foreground/60 text-center py-6">No deals</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
