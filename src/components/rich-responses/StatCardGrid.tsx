"use client";

import type { StatCard } from "@/types/conversation";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  data: StatCard[];
}

const CARD_COLORS = [
  { bar: "bg-indigo-500", bg: "bg-indigo-50/50 dark:bg-indigo-950/30", text: "text-indigo-600 dark:text-indigo-400" },
  { bar: "bg-violet-500", bg: "bg-violet-50/50 dark:bg-violet-950/30", text: "text-violet-600 dark:text-violet-400" },
  { bar: "bg-amber-500", bg: "bg-amber-50/50 dark:bg-amber-950/30", text: "text-amber-600 dark:text-amber-400" },
  { bar: "bg-emerald-500", bg: "bg-emerald-50/50 dark:bg-emerald-950/30", text: "text-emerald-600 dark:text-emerald-400" },
  { bar: "bg-blue-500", bg: "bg-blue-50/50 dark:bg-blue-950/30", text: "text-blue-600 dark:text-blue-400" },
  { bar: "bg-rose-500", bg: "bg-rose-50/50 dark:bg-rose-950/30", text: "text-rose-600 dark:text-rose-400" },
];

export function StatCardGrid({ data }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 my-4">
      {data.map((card, i) => {
        const color = CARD_COLORS[i % CARD_COLORS.length];
        return (
          <div key={i} className="glass-card rounded-xl overflow-hidden group/stat">
            <div className={`h-[2.5px] ${color.bar}`} />
            <div className="px-4 pt-3.5 pb-4">
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`w-1.5 h-1.5 rounded-full ${color.bar}`} />
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.08em]">{card.label}</p>
              </div>
              <p className="text-2xl font-bold text-foreground leading-none tracking-tight">{card.value}</p>
              {card.subtext && <p className="text-[11px] text-muted-foreground/60 mt-2.5">{card.subtext}</p>}
              {card.trend && card.trend !== "neutral" && (
                <div className={`inline-flex items-center gap-1 mt-3 text-[11px] font-semibold px-2 py-0.5 rounded-md ${card.trend === "up" ? "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40" : "text-red-500 bg-red-50 dark:text-red-400 dark:bg-red-950/40"}`}>
                  {card.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {card.trendValue}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
