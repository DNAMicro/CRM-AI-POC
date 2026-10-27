"use client";

import type { Activity } from "@/types/crm";
import { formatRelativeDate } from "@/lib/format";
import { Phone, Mail, Calendar, StickyNote, CheckSquare, Briefcase } from "lucide-react";
import { CardShell, CardHeader } from "./card-parts";

const ACTIVITY_ICON_MAP: Record<string, React.ReactNode> = {
  call: <Phone className="w-3.5 h-3.5" />,
  email: <Mail className="w-3.5 h-3.5" />,
  meeting: <Calendar className="w-3.5 h-3.5" />,
  note: <StickyNote className="w-3.5 h-3.5" />,
  task: <CheckSquare className="w-3.5 h-3.5" />,
  "deal-update": <Briefcase className="w-3.5 h-3.5" />,
};

const ACTIVITY_COLORS: Record<string, string> = {
  call: "bg-blue-100 text-blue-600 ring-blue-200/60 dark:bg-blue-950/50 dark:text-blue-400 dark:ring-blue-800/40",
  email: "bg-violet-100 text-violet-600 ring-violet-200/60 dark:bg-violet-950/50 dark:text-violet-400 dark:ring-violet-800/40",
  meeting: "bg-amber-100 text-amber-600 ring-amber-200/60 dark:bg-amber-950/50 dark:text-amber-400 dark:ring-amber-800/40",
  note: "bg-slate-100 text-slate-500 ring-slate-200/60 dark:bg-slate-800/50 dark:text-slate-400 dark:ring-slate-700/40",
  task: "bg-emerald-100 text-emerald-600 ring-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-400 dark:ring-emerald-800/40",
  "deal-update": "bg-indigo-100 text-indigo-600 ring-indigo-200/60 dark:bg-indigo-950/50 dark:text-indigo-400 dark:ring-indigo-800/40",
};

interface EnrichedActivity extends Activity {
  contactName?: string;
}

interface Props {
  data: EnrichedActivity[];
}

export function ActivityTimeline({ data }: Props) {
  if (data.length === 0) return null;

  return (
    <CardShell accent="bg-indigo-500">
      <CardHeader title="Activity" subtitle={`${data.length} ${data.length === 1 ? "entry" : "entries"}`} />
      <div className="mt-4">
        {data.map((activity, i) => (
          <div key={activity.id} className="flex gap-3 relative">
            {i < data.length - 1 && (
              <div className="absolute left-[15px] top-[34px] bottom-0 w-px bg-border" />
            )}
            <div className={`w-[30px] h-[30px] rounded-lg flex items-center justify-center flex-shrink-0 z-10 ring-1 ${ACTIVITY_COLORS[activity.type] || ACTIVITY_COLORS.note}`}>
              {ACTIVITY_ICON_MAP[activity.type] || <StickyNote className="w-3.5 h-3.5" />}
            </div>
            <div className={`flex-1 min-w-0 ${i < data.length - 1 ? "pb-4" : ""}`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs">
                  <span className="font-semibold text-foreground capitalize">{activity.type.replace("-", " ")}</span>
                  {activity.contactName && <span className="text-muted-foreground"> with {activity.contactName}</span>}
                </p>
                <time className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">{formatRelativeDate(activity.timestamp)}</time>
              </div>
              <p className="text-sm text-foreground mt-1 leading-relaxed">{activity.description}</p>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}
