"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDetailPanelState, useDetailPanelActions } from "@/hooks/useDetailPanel";
import { fetchContact, fetchDeal, type ContactDetail, type DealDetail } from "@/lib/api-client";
import type { PipelineStage } from "@/types/crm";
import { STAGE_BADGE_COLORS, STAGE_LABELS, STATUS_COLORS, ACTIVITY_ICONS } from "@/lib/constants";
import { formatCurrency, formatDate, formatRelativeDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Mail, Phone, Clock, Building, Calendar, DollarSign, Target, User, ChevronRight } from "lucide-react";
import { PinnedSidebar } from "./PinnedSidebar";

export function RightDetailPanel() {
  const { isOpen, entityType, entityId, pinnedItems, sidebarWidth, sidebarVisible } = useDetailPanelState();
  const { closePanel, setSidebarWidth, toggleSidebar } = useDetailPanelActions();
  const isResizing = useRef(false);

  const showDetail = isOpen && entityType && entityId;
  const showPinned = pinnedItems.length > 0;
  const shouldShow = sidebarVisible && (showDetail || showPinned);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX - e.clientX;
      setSidebarWidth(startWidth + delta);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [sidebarWidth, setSidebarWidth]);

  // Toggle button shown when sidebar is hidden but has pins
  if (!shouldShow && showPinned) {
    return (
      <button
        onClick={toggleSidebar}
        className="h-screen w-8 flex items-center justify-center hover:bg-accent/40 transition-colors border-l border-border/20"
        title="Show pinned items"
      >
        <ChevronRight className="w-4 h-4 text-muted-foreground/60 rotate-180" />
      </button>
    );
  }

  if (!shouldShow) return <div className="h-screen w-0 transition-all duration-300" />;

  return (
    <div
      className="h-screen glass-panel border-l-0 overflow-hidden transition-all duration-300 ease-in-out relative"
      style={{ width: shouldShow ? `${sidebarWidth}px` : 0 }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 flex items-center justify-center hover:bg-primary/10 transition-colors"
        onMouseDown={handleMouseDown}
      >
        <div className="w-0.5 h-8 rounded-full bg-border/50" />
      </div>

      <div style={{ width: `${sidebarWidth}px` }} className="h-full flex flex-col">
        {showDetail ? (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 bg-gradient-to-r from-indigo-500/[0.02] to-transparent">
              <h2 className="font-semibold text-foreground text-base tracking-tight">
                {entityType === "contact" ? "Contact Details" : "Deal Details"}
              </h2>
              <button onClick={closePanel} className="w-7 h-7 rounded-lg hover:bg-muted/80 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-muted-foreground/70" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {entityType === "contact" && <ContactDetailView contactId={entityId} />}
              {entityType === "deal" && <DealDetailView dealId={entityId} />}
            </div>
          </>
        ) : (
          <PinnedSidebar />
        )}
      </div>
    </div>
  );
}

function ContactDetailView({ contactId }: { contactId: string }) {
  const [data, setData] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchContact(contactId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [contactId]);

  if (loading) return <LoadingSkeleton />;
  if (!data?.contact) return <div className="p-5 text-muted-foreground text-sm">Contact not found.</div>;

  const { contact, deals, activities } = data;

  return (
    <Tabs defaultValue="details" className="h-full">
      <TabsList className="w-full justify-start px-5 pt-3 bg-transparent">
        <TabsTrigger value="details" className="text-[13px]">Details</TabsTrigger>
        <TabsTrigger value="activity" className="text-[13px]">Activity</TabsTrigger>
        <TabsTrigger value="deals" className="text-[13px]">Deals</TabsTrigger>
      </TabsList>

      <TabsContent value="details" className="px-5 py-5 space-y-5">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/40 dark:to-violet-900/40 flex items-center justify-center ring-1 ring-indigo-200/40 dark:ring-indigo-700/30">
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold text-lg">{contact.firstName[0]}{contact.lastName[0]}</span>
          </div>
          <div>
            <h3 className="font-semibold text-foreground tracking-tight">{contact.firstName} {contact.lastName}</h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">{contact.title}</p>
          </div>
        </div>
        <Badge className={`${STATUS_COLORS[contact.status]} text-[11px]`}>{contact.status}</Badge>

        <div className="divider-fade" />

        <div className="space-y-4">
          <DetailRow icon={<Building className="w-3.5 h-3.5" />} label="Company" value={contact.company} />
          <DetailRow icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={contact.email} />
          <DetailRow icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={contact.phone} />
          <DetailRow icon={<Clock className="w-3.5 h-3.5" />} label="Last Contacted" value={formatRelativeDate(contact.lastContactedAt)} />
          <DetailRow icon={<Calendar className="w-3.5 h-3.5" />} label="Created" value={formatDate(contact.createdAt)} />
          <div>
            <span className="text-[11px] text-muted-foreground font-medium block mb-1.5">Tags</span>
            <div className="flex gap-1.5 flex-wrap">
              {contact.tags.map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-[10.5px]">{tag}</Badge>
              ))}
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="activity" className="px-5 py-5">
        <ActivityList activities={activities} />
      </TabsContent>

      <TabsContent value="deals" className="px-5 py-5 space-y-3">
        {deals.length === 0 && <p className="text-[13px] text-muted-foreground">No deals for this contact.</p>}
        {deals.map((deal) => (
          <div key={deal.id} className="p-3.5 rounded-xl border border-border/30 hover:border-border/50 hover:shadow-sm transition-all">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-foreground truncate">{deal.name}</span>
              <Badge className={`text-[10px] flex-shrink-0 ${STAGE_BADGE_COLORS[deal.stage as PipelineStage]}`}>
                {STAGE_LABELS[deal.stage as PipelineStage]}
              </Badge>
            </div>
            <p className="text-[12px] text-muted-foreground mt-1.5">{formatCurrency(deal.value)} · Close {formatDate(deal.closeDate)}</p>
          </div>
        ))}
      </TabsContent>
    </Tabs>
  );
}

function DealDetailView({ dealId }: { dealId: string }) {
  const [data, setData] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDeal(dealId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [dealId]);

  if (loading) return <LoadingSkeleton />;
  if (!data?.deal) return <div className="p-5 text-muted-foreground text-sm">Deal not found.</div>;

  const { deal, contact, activities } = data;

  return (
    <Tabs defaultValue="details" className="h-full">
      <TabsList className="w-full justify-start px-5 pt-3 bg-transparent">
        <TabsTrigger value="details" className="text-[13px]">Details</TabsTrigger>
        <TabsTrigger value="activity" className="text-[13px]">Activity</TabsTrigger>
      </TabsList>

      <TabsContent value="details" className="px-5 py-5 space-y-5">
        <div>
          <h3 className="font-semibold text-foreground tracking-tight">{deal.name}</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">{deal.company}</p>
        </div>
        <div className="flex gap-2">
          <Badge className={`${STAGE_BADGE_COLORS[deal.stage as PipelineStage]} text-[11px]`}>{STAGE_LABELS[deal.stage as PipelineStage]}</Badge>
          <Badge variant="outline" className="text-[11px]">{deal.priority} priority</Badge>
        </div>

        <div className="divider-fade" />

        <div className="space-y-4">
          <DetailRow icon={<DollarSign className="w-3.5 h-3.5" />} label="Value" value={formatCurrency(deal.value)} />
          <DetailRow icon={<Target className="w-3.5 h-3.5" />} label="Probability" value={`${deal.probability}%`} />
          <DetailRow icon={<Calendar className="w-3.5 h-3.5" />} label="Close Date" value={formatDate(deal.closeDate)} />
          <DetailRow icon={<User className="w-3.5 h-3.5" />} label="Assigned To" value={deal.assignedTo} />
          {contact && <DetailRow icon={<User className="w-3.5 h-3.5" />} label="Primary Contact" value={`${contact.firstName} ${contact.lastName}`} />}
          <DetailRow icon={<Calendar className="w-3.5 h-3.5" />} label="Created" value={formatDate(deal.createdAt)} />
          <DetailRow icon={<Clock className="w-3.5 h-3.5" />} label="Last Updated" value={formatRelativeDate(deal.updatedAt)} />
        </div>
      </TabsContent>

      <TabsContent value="activity" className="px-5 py-5">
        <ActivityList activities={activities} />
      </TabsContent>
    </Tabs>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <span className="text-[11px] text-muted-foreground font-medium block">{label}</span>
        <span className="text-sm text-foreground">{value}</span>
      </div>
    </div>
  );
}

function ActivityList({ activities }: { activities: { id: string; type: string; description: string; timestamp: string }[] }) {
  if (activities.length === 0) return <p className="text-[13px] text-muted-foreground">No activity yet.</p>;
  return (
    <div className="space-y-3">
      {activities.map((a) => (
        <div key={a.id} className="flex gap-3">
          <span className="text-base leading-none mt-0.5">{ACTIVITY_ICONS[a.type] || "📋"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-foreground/80">{a.description}</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">{formatRelativeDate(a.timestamp)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-muted/50 animate-pulse" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-32 bg-muted/50 rounded-lg animate-pulse" />
          <div className="h-3 w-24 bg-muted/50 rounded-lg animate-pulse" />
        </div>
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-16 bg-muted/50 rounded-lg animate-pulse" />
          <div className="h-4 w-40 bg-muted/50 rounded-lg animate-pulse" />
        </div>
      ))}
    </div>
  );
}
