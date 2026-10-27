"use client";

import { useState, useEffect } from "react";
import { useConversationActions, useConversationState } from "@/hooks/useConversation";
import { useTheme } from "@/hooks/useTheme";
import { fetchStats, type DashboardStats } from "@/lib/api-client";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { STAGE_DOT_COLORS } from "@/lib/constants";
import type { PipelineStage } from "@/types/crm";
import {
  LayoutDashboard,
  Users,
  Activity,
  Bell,
  TrendingUp,
  DollarSign,
  CalendarClock,
  UserCheck,
  Pin,
  Sparkles,
  Inbox,
  MessageSquare,
  Settings,
  Plus,
  MessageCircle,
  CheckSquare,
  Moon,
  Sun,
  MonitorSmartphone,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

export function LeftSidebar() {
  const { triggerIntent, newConversation, loadConversation, renameConversation, deleteConversation } = useConversationActions();
  const { conversationId, conversations } = useConversationState();
  const { isDark, mode, cycleTheme } = useTheme();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // No outside-click handler — menu closes via button clicks only

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});

    // Poll for badge updates every 60 seconds
    const interval = setInterval(() => {
      fetchStats().then(setStats).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="w-[280px] h-screen glass-panel flex flex-col overflow-hidden border-r-0">
      {/* Branding */}
      <div className="px-5 py-4 flex items-center gap-3.5 bg-gradient-to-r from-indigo-500/[0.05] via-violet-500/[0.03] to-transparent">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-glass-lg ring-2 ring-indigo-500/20">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="font-bold text-base text-foreground tracking-tight block leading-none">CRM AI</span>
          <span className="text-xs text-muted-foreground mt-1 block tracking-wide">Intelligent Sales Assistant</span>
        </div>
      </div>

      <div className="mx-5 divider-fade" />

      {/* Quick Stats */}
      <div className="px-5 py-3.5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.1em] mb-3 px-0.5">Quick Stats</p>
        {stats ? (
          <div className="grid grid-cols-2 gap-2.5">
            <MiniStatCard icon={<TrendingUp className="w-3.5 h-3.5" />} label="Deals" value={stats.activeDealsCount.toString()} color="indigo" onClick={() => triggerIntent("show-pipeline", { __chipLabel: "Show pipeline" })} />
            <MiniStatCard icon={<DollarSign className="w-3.5 h-3.5" />} label="Pipeline" value={formatCurrency(stats.pipelineValue)} color="violet" onClick={() => triggerIntent("show-pipeline", { __chipLabel: "Show pipeline" })} />
            <MiniStatCard icon={<CalendarClock className="w-3.5 h-3.5" />} label="Closing" value={stats.closingThisMonthCount.toString()} color="amber" onClick={() => triggerIntent("deals-closing-soon", { __chipLabel: "Closing this month" })} />
            <MiniStatCard icon={<UserCheck className="w-3.5 h-3.5" />} label="Contacts" value={stats.activeContactsCount.toString()} color="emerald" onClick={() => triggerIntent("show-contacts", { __chipLabel: "Show contacts" })} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[68px] rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        )}
      </div>

      <div className="mx-5 divider-fade" />

      {/* Navigation */}
      <div className="px-5 py-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.1em] mb-2.5 px-0.5">Navigate</p>
        <nav className="space-y-0.5">
          <NavItem icon={<LayoutDashboard className="w-4 h-4" />} label="Pipeline" badge={stats?.activeDealsCount} onClick={() => triggerIntent("show-pipeline", { __chipLabel: "Show pipeline" })} />
          <NavItem icon={<Users className="w-4 h-4" />} label="Contacts" badge={stats?.activeContactsCount} onClick={() => triggerIntent("show-contacts", { __chipLabel: "Show contacts" })} />
          <NavItem icon={<Activity className="w-4 h-4" />} label="Activity" onClick={() => triggerIntent("recent-activity", { __chipLabel: "Recent activity" })} />
          <NavItem icon={<Bell className="w-4 h-4" />} label="Tasks" badge={stats?.pendingCount} badgeColor={stats?.overdueCount ? "red" : "amber"} onClick={() => triggerIntent("show-tasks", { __chipLabel: "Show tasks" })} />
          <NavItem icon={<Inbox className="w-4 h-4" />} label="Inbox" badge={stats?.unreadEmailCount} badgeColor="indigo" onClick={() => triggerIntent("show-inbox", { __chipLabel: "Show inbox" })} />
          <NavItem icon={<MessageSquare className="w-4 h-4" />} label="Messages" badge={stats?.unreadSmsCount} badgeColor="emerald" onClick={() => triggerIntent("sms-history", { __chipLabel: "SMS messages" })} />
        </nav>
      </div>

      <div className="mx-5 divider-fade" />

      {/* Conversations + Pinned Deals */}
      <div className="px-5 py-3 flex-1 overflow-y-auto space-y-4">
        {/* New Chat Button */}
        <button
          onClick={() => newConversation()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold hover:from-indigo-600 hover:to-violet-700 active:scale-[0.97] transition-all shadow-glass hover:shadow-glass-lg"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>

        {/* Recent Conversations */}
        {conversations.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.1em] mb-2 px-0.5 flex items-center gap-1.5">
              <MessageCircle className="w-3 h-3" /> Recent Chats
            </p>
            <div className="space-y-0.5">
              {conversations.slice(0, 8).map((conv) => (
                <div
                  key={conv.id}
                  className={`relative group w-full text-left px-3 py-2 rounded-xl hover:bg-accent/70 active:scale-[0.98] transition-all ${
                    conv.id === conversationId ? "bg-accent/50 shadow-sm" : ""
                  } ${menuOpenId === conv.id ? "z-50" : ""}`}
                >
                  {renamingId === conv.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && renameValue.trim()) {
                          renameConversation(conv.id, renameValue.trim());
                          setRenamingId(null);
                        }
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => {
                        if (renameValue.trim()) renameConversation(conv.id, renameValue.trim());
                        setRenamingId(null);
                      }}
                      className="w-full text-sm font-medium bg-transparent border border-primary/30 rounded-lg px-2 py-0.5 outline-none focus:ring-1 focus:ring-primary/40"
                    />
                  ) : (
                    <button
                      onClick={() => loadConversation(conv.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground group-hover:text-foreground truncate">
                          {conv.title}
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatDateTime(conv.updatedAt)}
                        </span>
                      </div>
                    </button>
                  )}
                  {/* Context menu trigger */}
                  {renamingId !== conv.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === conv.id ? null : conv.id); }}
                      aria-label={`Options for ${conv.title}`}
                      aria-expanded={menuOpenId === conv.id}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-accent transition-all"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                  {/* Dropdown menu */}
                  {menuOpenId === conv.id && (
                    <div className="absolute right-0 top-full mt-1 z-50 glass-surface border border-border/60 rounded-xl shadow-glass py-1 min-w-[130px]">
                      <button
                        onClick={() => { setRenamingId(conv.id); setRenameValue(conv.title); setMenuOpenId(null); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-foreground hover:bg-accent/60 transition-colors"
                      >
                        <Pencil className="w-3 h-3" /> Rename
                      </button>
                      <button
                        onClick={() => { setMenuOpenId(null); deleteConversation(conv.id); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pinned Deals */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.1em] mb-2 px-0.5 flex items-center gap-1.5">
            <Pin className="w-3 h-3" /> Pinned Deals
          </p>
          {stats?.pinnedDeals ? (
            <div className="space-y-0.5">
              {stats.pinnedDeals.map((deal) => (
                <button
                  key={deal.id}
                  onClick={() => triggerIntent("deal-detail", { dealId: deal.id, __chipLabel: `Details: ${deal.company}` })}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-accent/70 active:scale-[0.98] transition-all group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ring-2 ring-white dark:ring-background ${STAGE_DOT_COLORS[deal.stage as PipelineStage]}`} />
                    <span className="text-sm font-medium text-foreground group-hover:text-foreground truncate">
                      {deal.company}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-[18px] truncate mt-0.5">{deal.name}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mx-5 divider-fade" />
      <div className="px-5 py-3 flex items-center gap-1">
        <div className="flex-1">
          <NavItem icon={<Settings className="w-4 h-4" />} label="Settings" onClick={() => { window.location.href = "/settings"; }} />
        </div>
        <button
          onClick={cycleTheme}
          className="p-2.5 rounded-xl hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground"
          title={mode === "light" ? "Switch to dark" : mode === "dark" ? "Switch to system" : "Switch to light"}
        >
          {mode === "light" ? <Sun className="w-4 h-4" /> : mode === "dark" ? <Moon className="w-4 h-4" /> : <MonitorSmartphone className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}

const MINI_COLORS: Record<string, { bar: string; icon: string }> = {
  indigo: { bar: "bg-indigo-500", icon: "text-indigo-500" },
  violet: { bar: "bg-violet-500", icon: "text-violet-500" },
  amber: { bar: "bg-amber-500", icon: "text-amber-500" },
  emerald: { bar: "bg-emerald-500", icon: "text-emerald-500" },
};

function MiniStatCard({ icon, label, value, color = "indigo", onClick }: { icon: React.ReactNode; label: string; value: string; color?: string; onClick: () => void }) {
  const c = MINI_COLORS[color] || MINI_COLORS.indigo;
  return (
    <button
      onClick={onClick}
      className="glass-card rounded-xl text-left hover:shadow-glass-lg active:scale-[0.97] transition-all group overflow-hidden"
    >
      <div className={`h-[2.5px] ${c.bar}`} />
      <div className="px-3 py-3">
        <div className="flex items-center gap-1.5 mb-2">
          <span className={`${c.icon} opacity-50 group-hover:opacity-100 transition-opacity`}>{icon}</span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.08em]">{label}</span>
        </div>
        <p className="text-lg font-bold text-foreground leading-none tracking-tight">{value}</p>
      </div>
    </button>
  );
}

function NavItem({ icon, label, badge, badgeColor, onClick }: { icon: React.ReactNode; label: string; badge?: number; badgeColor?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-accent/60 active:scale-[0.98] transition-all group relative">
      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-0 rounded-r-full bg-primary group-hover:h-5 transition-all duration-200" />
      <span className="text-muted-foreground group-hover:text-primary transition-colors">{icon}</span>
      <span className="text-sm font-medium text-foreground/90 group-hover:text-foreground flex-1 text-left transition-colors">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
          badgeColor === "red"
            ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
            : badgeColor === "amber"
            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
            : badgeColor === "indigo"
            ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400"
            : badgeColor === "emerald"
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
            : "bg-muted text-muted-foreground"
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}
