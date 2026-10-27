"use client";

import { useState } from "react";
import type { DataTableData, TableColumn } from "@/types/conversation";
import type { PipelineStage } from "@/types/crm";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { STAGE_BADGE_COLORS, STAGE_LABELS, STATUS_COLORS, PRIORITY_DOT_COLORS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import { useDetailPanelActions } from "@/hooks/useDetailPanel";
import { useConversationActions } from "@/hooks/useConversation";
import { ArrowUp, ArrowDown } from "lucide-react";

interface Props {
  data: DataTableData;
}

export function DataTableBlock({ data }: Props) {
  const { columns, rows, entityType, idField } = data;
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const { openPanel } = useDetailPanelActions();
  const { triggerIntent } = useConversationActions();

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedRows = [...rows].sort((a, b) => {
    if (!sortKey) return 0;
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    }
    const aStr = String(aVal || "");
    const bStr = String(bVal || "");
    return sortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  });

  const handleRowClick = (row: Record<string, unknown>) => {
    if (!entityType || !idField) return;
    const id = String(row[idField]);
    if (entityType === "deal") {
      openPanel("deal", id);
      triggerIntent("deal-detail", { dealId: id, __chipLabel: `Details: ${row.company || row.name}` });
    } else if (entityType === "contact") {
      openPanel("contact", id);
      triggerIntent("contact-detail", { contactId: id, __chipLabel: `Show ${row.firstName || row.name}` });
    }
  };

  const renderCell = (col: TableColumn, value: unknown) => {
    switch (col.type) {
      case "currency":
        return <span className="font-semibold tabular-nums">{formatCurrency(Number(value))}</span>;
      case "date":
        return <span className="text-muted-foreground tabular-nums">{formatDate(String(value))}</span>;
      case "status": {
        const stage = String(value) as PipelineStage;
        if (STAGE_BADGE_COLORS[stage]) {
          return <Badge className={`text-[11px] font-medium ${STAGE_BADGE_COLORS[stage]}`}>{STAGE_LABELS[stage] || stage}</Badge>;
        }
        const statusKey = String(value) as keyof typeof STATUS_COLORS;
        if (STATUS_COLORS[statusKey]) {
          return <Badge className={`text-[11px] font-medium ${STATUS_COLORS[statusKey]}`}>{String(value)}</Badge>;
        }
        return <span>{String(value)}</span>;
      }
      case "priority": {
        const priority = String(value) as keyof typeof PRIORITY_DOT_COLORS;
        return (
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT_COLORS[priority] || "bg-slate-300"}`} />
            <span className="text-[12px] text-muted-foreground capitalize">{String(value)}</span>
          </div>
        );
      }
      default:
        return <span>{String(value ?? "")}</span>;
    }
  };

  return (
    <div className="my-4 glass-card rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gradient-to-r from-muted/40 via-muted/30 to-muted/40 hover:bg-muted/30 border-b border-border/40">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={`text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider ${col.sortable ? "cursor-pointer hover:text-foreground select-none" : ""}`}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key && (
                    sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                  )}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row, i) => (
            <TableRow
              key={i}
              className={`${entityType ? "cursor-pointer hover:bg-primary/[0.03]" : ""} border-b border-border/20 transition-all duration-150 hover:shadow-[inset_3px_0_0_oklch(0.54_0.24_265)]`}
              onClick={() => handleRowClick(row)}
            >
              {columns.map((col) => (
                <TableCell key={col.key} className="text-[13px] py-3.5">
                  {renderCell(col, row[col.key])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > 0 && (
        <div className="px-4 py-2 border-t border-border/30 bg-muted/20">
          <p className="text-[11px] text-muted-foreground">Showing {rows.length} {rows.length === 1 ? "result" : "results"}</p>
        </div>
      )}
    </div>
  );
}
