"use client";

import type { RichBlock } from "@/types/conversation";
import { useDetailPanelActions } from "@/hooks/useDetailPanel";
import { Maximize2, Pin } from "lucide-react";

interface Props {
  block: RichBlock;
  children: React.ReactNode;
}

export function BlockWrapper({ block, children }: Props) {
  const { expandBlock, pinBlock } = useDetailPanelActions();

  // Skip toolbar for non-visual blocks
  if (block.type === "action-buttons" || block.type === "inline-form" || block.type === "email-compose" || block.type === "sms-compose") {
    return <>{children}</>;
  }

  return (
    <div className="group/block relative">
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/block:opacity-100 transition-opacity z-10">
        <button
          onClick={() => expandBlock(block)}
          className="w-7 h-7 rounded-lg border border-border/60 bg-background/90 backdrop-blur-sm flex items-center justify-center hover:bg-accent hover:border-primary/30 transition-all shadow-sm"
          title="Expand"
        >
          <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={() => pinBlock(block)}
          className="w-7 h-7 rounded-lg border border-border/60 bg-background/90 backdrop-blur-sm flex items-center justify-center hover:bg-accent hover:border-primary/30 transition-all shadow-sm"
          title="Pin to sidebar"
        >
          <Pin className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
      {children}
    </div>
  );
}
