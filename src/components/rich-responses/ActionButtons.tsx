"use client";

import { Button } from "@/components/ui/button";
import { Phone, Mail, ArrowRightLeft } from "lucide-react";
import { useConversationActions } from "@/hooks/useConversation";

interface ActionDef {
  label: string;
  intent: string;
  params?: Record<string, string>;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  "Log a Call": <Phone className="w-3.5 h-3.5" />,
  "Send Email": <Mail className="w-3.5 h-3.5" />,
  "Update Stage": <ArrowRightLeft className="w-3.5 h-3.5" />,
};

interface Props {
  data: ActionDef[];
}

export function ActionButtons({ data }: Props) {
  const { triggerIntent } = useConversationActions();

  return (
    <div className="flex flex-wrap gap-2 my-4">
      {data.map((action, i) => (
        <Button
          key={i}
          variant={i === 0 ? "default" : "outline"}
          size="sm"
          onClick={() => triggerIntent(action.intent, { ...action.params, __chipLabel: action.label })}
          className={`${i === 0 ? "bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-glass border-0 text-white" : "hover:bg-accent"} gap-1.5 rounded-xl`}
        >
          {ICON_MAP[action.label]}
          {action.label}
        </Button>
      ))}
    </div>
  );
}
