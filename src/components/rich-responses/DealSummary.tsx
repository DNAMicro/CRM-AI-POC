"use client";

import type { Contact, Deal } from "@/types/crm";
import { Badge } from "@/components/ui/badge";
import { STAGE_BADGE_COLORS, STAGE_DOT_COLORS, STAGE_LABELS, PRIORITY_DOT_COLORS } from "@/lib/constants";
import { formatCurrency, formatDate, formatRelativeDate } from "@/lib/format";
import type { PipelineStage } from "@/types/crm";
import { DollarSign, Gauge, CalendarClock } from "lucide-react";
import { CardShell, CardHeader, CardSection, Field, MetricTile, isOverdue } from "./card-parts";

interface Props {
  data: {
    deal: Deal;
    contact?: Contact;
  };
}

export function DealSummary({ data }: Props) {
  const { deal, contact } = data;
  const stage = deal.stage as PipelineStage;
  const overdue = isOverdue(deal.closeDate, deal.stage);

  return (
    <CardShell accent={STAGE_DOT_COLORS[stage]}>
      <CardHeader
        title={deal.name}
        subtitle={deal.company}
        trailing={<Badge className={`${STAGE_BADGE_COLORS[stage]} text-[11px]`}>{STAGE_LABELS[stage]}</Badge>}
      />

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <MetricTile label="Value" value={formatCurrency(deal.value)} tone="emerald" icon={<DollarSign className="w-3.5 h-3.5" />} />
        <MetricTile label="Probability" value={`${deal.probability}%`} tone="violet" icon={<Gauge className="w-3.5 h-3.5" />} />
        <MetricTile
          label="Close date"
          value={formatDate(deal.closeDate)}
          tone={overdue ? "red" : "amber"}
          icon={<CalendarClock className="w-3.5 h-3.5" />}
          note={overdue ? "Overdue" : undefined}
        />
      </div>

      <CardSection label="Details">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Priority">
            <span className="inline-flex items-center gap-2 capitalize">
              <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT_COLORS[deal.priority]}`} />
              {deal.priority}
            </span>
          </Field>
          <Field label="Assigned to">{deal.assignedTo}</Field>
          {contact && (
            <Field label="Primary contact">
              {contact.firstName} {contact.lastName}
              {contact.title && <span className="block text-[13px] text-muted-foreground">{contact.title}</span>}
            </Field>
          )}
          <Field label="Last updated">{formatRelativeDate(deal.updatedAt)}</Field>
        </div>
      </CardSection>
    </CardShell>
  );
}
