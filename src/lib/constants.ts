import type { PipelineStage } from "@/types/crm";

export const STAGE_LABELS: Record<PipelineStage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  "closed-won": "Closed Won",
  "closed-lost": "Closed Lost",
};

export const STAGE_BADGE_COLORS: Record<PipelineStage, string> = {
  lead: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700/60",
  qualified: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900/60",
  proposal: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-900/60",
  negotiation: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/60",
  "closed-won": "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/60",
  "closed-lost": "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900/60",
};

export const STAGE_DOT_COLORS: Record<PipelineStage, string> = {
  lead: "bg-slate-400",
  qualified: "bg-blue-500",
  proposal: "bg-violet-500",
  negotiation: "bg-amber-500",
  "closed-won": "bg-emerald-500",
  "closed-lost": "bg-red-500",
};

export const PRIORITY_COLORS = {
  high: "text-red-600",
  medium: "text-amber-600",
  low: "text-slate-400",
};

export const PRIORITY_DOT_COLORS = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-slate-300 dark:bg-slate-500",
};

export const STATUS_COLORS = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  inactive: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
  churned: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};

export const STATUS_DOT_COLORS = {
  active: "bg-emerald-500",
  inactive: "bg-slate-400",
  churned: "bg-red-500",
};

export const ACTIVITY_ICONS: Record<string, string> = {
  call: "📞",
  email: "📧",
  meeting: "📅",
  note: "📝",
  task: "✅",
  "deal-update": "💼",
  sms: "💬",
};

export const PIPELINE_STAGES: PipelineStage[] = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "closed-won",
  "closed-lost",
];
