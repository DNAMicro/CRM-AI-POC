import type { ReactNode } from "react";

// Shared building blocks for record cards (deal, contact, activity) so they
// match the greeting stat cards and pipeline columns: a glass card with a
// colored top bar, solid-contrast labels, and full-strength values.

export function CardShell({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <div className="my-4 glass-card rounded-xl overflow-hidden">
      <div className={`h-[2.5px] ${accent}`} />
      <div className="p-5">{children}</div>
    </div>
  );
}

export function CardHeader({ title, subtitle, leading, trailing }: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3.5">
      {leading}
      <div className="flex-1 min-w-0">
        <h3 className="text-[15px] font-semibold text-foreground leading-snug">{title}</h3>
        {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {trailing}
    </div>
  );
}

export function Field({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  );
}

/** Divides a card into sections; label style matches the stat-card labels. */
export function CardSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-5 pt-4 border-t border-border/60">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-2.5">{label}</p>
      {children}
    </div>
  );
}

// ===== Tinted inner tiles =====
// Inner boxes get a hue-tinted fill, border and icon chip so they stand apart
// from the card they sit in. Class strings are literal so Tailwind keeps them.

export type Tone = "slate" | "blue" | "violet" | "amber" | "emerald" | "red";

export const TONES: Record<Tone, { tile: string; chip: string; value: string }> = {
  slate: {
    tile: "bg-gradient-to-br from-slate-100/80 to-slate-50/30 border-slate-200 dark:from-slate-400/[0.12] dark:to-slate-400/[0.03] dark:border-slate-400/20",
    chip: "bg-slate-200/70 text-slate-600 dark:bg-slate-400/20 dark:text-slate-300",
    value: "text-slate-800 dark:text-slate-100",
  },
  blue: {
    tile: "bg-gradient-to-br from-blue-50 to-blue-50/20 border-blue-200/80 dark:from-blue-500/[0.14] dark:to-blue-500/[0.03] dark:border-blue-400/25",
    chip: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
    value: "text-blue-800 dark:text-blue-100",
  },
  violet: {
    tile: "bg-gradient-to-br from-violet-50 to-violet-50/20 border-violet-200/80 dark:from-violet-500/[0.14] dark:to-violet-500/[0.03] dark:border-violet-400/25",
    chip: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300",
    value: "text-violet-800 dark:text-violet-100",
  },
  amber: {
    tile: "bg-gradient-to-br from-amber-50 to-amber-50/20 border-amber-200/80 dark:from-amber-500/[0.14] dark:to-amber-500/[0.03] dark:border-amber-400/25",
    chip: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
    value: "text-amber-800 dark:text-amber-100",
  },
  emerald: {
    tile: "bg-gradient-to-br from-emerald-50 to-emerald-50/20 border-emerald-200/80 dark:from-emerald-500/[0.14] dark:to-emerald-500/[0.03] dark:border-emerald-400/25",
    chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300",
    value: "text-emerald-800 dark:text-emerald-100",
  },
  red: {
    tile: "bg-gradient-to-br from-red-50 to-red-50/20 border-red-200/80 dark:from-red-500/[0.14] dark:to-red-500/[0.03] dark:border-red-400/25",
    chip: "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300",
    value: "text-red-800 dark:text-red-100",
  },
};

export const STAGE_TONES: Record<string, Tone> = {
  lead: "slate",
  qualified: "blue",
  proposal: "violet",
  negotiation: "amber",
  "closed-won": "emerald",
  "closed-lost": "red",
};

/** An open deal whose close date (a calendar date) is before today. */
export function isOverdue(closeDate: string, stage: string): boolean {
  if (stage === "closed-won" || stage === "closed-lost") return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return closeDate.slice(0, 10) < today;
}

export function MetricTile({ label, value, tone, icon, note }: {
  label: string;
  value: string;
  tone: Tone;
  icon: ReactNode;
  note?: string;
}) {
  const t = TONES[tone];
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${t.tile}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em] pt-1">{label}</p>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${t.chip}`}>{icon}</span>
      </div>
      <p className={`text-lg font-bold mt-1 leading-none tracking-tight tabular-nums ${t.value}`}>{value}</p>
      {note && <p className="text-[11px] font-medium text-muted-foreground mt-1.5">{note}</p>}
    </div>
  );
}
