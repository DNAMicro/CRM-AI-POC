"use client";

import type { IntegrationStatusData } from "@/types/conversation";
import { Mail, MessageSquare, CheckCircle2, AlertCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface Props {
  data: IntegrationStatusData;
}

export function IntegrationStatus({ data }: Props) {
  return (
    <div className="my-4 glass-card rounded-xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Integration Status</h3>

      <div className="space-y-3">
        {/* Gmail */}
        <div className="flex items-center justify-between p-3 glass-surface rounded-xl">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${data.gmail.connected ? "bg-emerald-100" : "bg-muted"}`}>
              <Mail className={`w-4 h-4 ${data.gmail.connected ? "text-emerald-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-[13px] font-medium text-foreground">Gmail</p>
              {data.gmail.connected ? (
                <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Connected as {data.gmail.email}
                </p>
              ) : data.gmail.configured ? (
                <p className="text-[11px] text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Configured but not connected
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Not configured</p>
              )}
            </div>
          </div>
          {!data.gmail.connected && (
            <Link href="/settings">
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-[12px]">
                <Settings className="w-3.5 h-3.5" />
                Set up
              </Button>
            </Link>
          )}
        </div>

        {/* SMS */}
        <div className="flex items-center justify-between p-3 glass-surface rounded-xl">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${data.sms.configured ? "bg-emerald-100" : "bg-muted"}`}>
              <MessageSquare className={`w-4 h-4 ${data.sms.configured ? "text-emerald-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-[13px] font-medium text-foreground">SMS (Twilio)</p>
              {data.sms.configured ? (
                <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Configured &middot; {data.sms.phoneNumber}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Not configured</p>
              )}
            </div>
          </div>
          {!data.sms.configured && (
            <Link href="/settings">
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-[12px]">
                <Settings className="w-3.5 h-3.5" />
                Set up
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Go to settings link */}
      <div className="mt-4 pt-3 border-t border-border/30 text-center">
        <Link href="/settings" className="text-[12px] text-indigo-600 hover:text-indigo-700 font-medium">
          Manage integrations in Settings &rarr;
        </Link>
      </div>
    </div>
  );
}
