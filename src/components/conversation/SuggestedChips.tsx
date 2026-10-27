"use client";

import type { ChipAction } from "@/types/conversation";
import { useConversationActions } from "@/hooks/useConversation";
import { ArrowRight } from "lucide-react";

interface Props {
  chips: ChipAction[];
}

export function SuggestedChips({ chips }: Props) {
  const { triggerIntent } = useConversationActions();

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {chips.map((chip, i) => (
        <button
          key={i}
          onClick={() => triggerIntent(chip.intent, { ...chip.params, __chipLabel: chip.label })}
          className="group inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium text-primary/80 hover:text-primary bg-primary/[0.04] hover:bg-primary/[0.08] border border-primary/12 hover:border-primary/25 rounded-xl active:scale-[0.97] transition-all hover:shadow-glass"
        >
          {chip.label}
          <ArrowRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
        </button>
      ))}
    </div>
  );
}
