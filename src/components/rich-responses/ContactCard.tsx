"use client";

import type { Contact, Deal } from "@/types/crm";
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS, STATUS_DOT_COLORS, STAGE_BADGE_COLORS, STAGE_LABELS } from "@/lib/constants";
import { formatCurrency, formatRelativeDate } from "@/lib/format";
import type { PipelineStage } from "@/types/crm";
import { Mail, Phone, Clock, Tag } from "lucide-react";
import { CardShell, CardHeader, CardSection, Field } from "./card-parts";

interface Props {
  data: {
    contact: Contact;
    deals: Deal[];
  };
}

const ICON = "w-3.5 h-3.5";

export function ContactCard({ data }: Props) {
  const { contact, deals } = data;

  return (
    <CardShell accent={STATUS_DOT_COLORS[contact.status]}>
      <CardHeader
        title={`${contact.firstName} ${contact.lastName}`}
        subtitle={[contact.title, contact.company].filter(Boolean).join(" at ")}
        leading={
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/40 dark:to-violet-900/40 flex items-center justify-center flex-shrink-0 ring-1 ring-indigo-200/40 dark:ring-indigo-700/30">
            <span className="text-indigo-600 dark:text-indigo-400 font-bold text-lg">{contact.firstName[0]}{contact.lastName[0]}</span>
          </div>
        }
        trailing={<Badge className={`${STATUS_COLORS[contact.status]} text-[11px] capitalize`}>{contact.status}</Badge>}
      />

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
        <Field label="Email" icon={<Mail className={ICON} />}>
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="block truncate hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline underline-offset-2">
              {contact.email}
            </a>
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </Field>
        <Field label="Phone" icon={<Phone className={ICON} />}>
          {contact.phone || <span className="text-muted-foreground">Not set</span>}
        </Field>
        <Field label="Last contact" icon={<Clock className={ICON} />}>
          {formatRelativeDate(contact.lastContactedAt)}
        </Field>
        <Field label="Tags" icon={<Tag className={ICON} />}>
          {contact.tags.length > 0 ? (
            <div className="flex gap-1 flex-wrap">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[11px] px-1.5 py-0 font-normal">{tag}</Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </Field>
      </div>

      {deals.length > 0 && (
        <CardSection label={`Deals (${deals.length})`}>
          <div className="divide-y divide-border/50">
            {deals.map((deal) => (
              <div key={deal.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="text-sm text-foreground truncate">{deal.name}</span>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(deal.value)}</span>
                  <Badge className={`text-[11px] ${STAGE_BADGE_COLORS[deal.stage as PipelineStage]}`}>
                    {STAGE_LABELS[deal.stage as PipelineStage]}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardSection>
      )}
    </CardShell>
  );
}
