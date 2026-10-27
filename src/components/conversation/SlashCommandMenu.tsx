"use client";

import { useEffect, useReducer } from "react";
import {
  UserPlus,
  PlusCircle,
  Activity,
  LayoutDashboard,
  Search,
  Bell,
  BarChart3,
  HelpCircle,
} from "lucide-react";
import type { SlashCommand } from "@/types/conversation";
import { filterSlashCommands } from "@/lib/slash-commands";

const ICON_MAP: Record<string, React.ReactNode> = {
  UserPlus: <UserPlus className="w-4 h-4" />,
  PlusCircle: <PlusCircle className="w-4 h-4" />,
  Activity: <Activity className="w-4 h-4" />,
  LayoutDashboard: <LayoutDashboard className="w-4 h-4" />,
  Search: <Search className="w-4 h-4" />,
  Bell: <Bell className="w-4 h-4" />,
  BarChart3: <BarChart3 className="w-4 h-4" />,
  HelpCircle: <HelpCircle className="w-4 h-4" />,
};

interface Props {
  filter: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

type MenuAction = { type: "up"; max: number } | { type: "down"; max: number } | { type: "reset" };

function menuReducer(state: number, action: MenuAction): number {
  switch (action.type) {
    case "up":
      return (state - 1 + action.max) % Math.max(action.max, 1);
    case "down":
      return (state + 1) % Math.max(action.max, 1);
    case "reset":
      return 0;
  }
}

export function SlashCommandMenu({ filter, onSelect, onClose }: Props) {
  const commands = filterSlashCommands(filter);
  const [selectedIndex, dispatch] = useReducer(menuReducer, 0);

  // Clamp selectedIndex to valid range (handles filter changes reducing the list)
  const clampedIndex = commands.length > 0 ? selectedIndex % commands.length : 0;

  useEffect(() => {
    dispatch({ type: "reset" });
  }, [filter]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        dispatch({ type: "down", max: commands.length });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        dispatch({ type: "up", max: commands.length });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (commands[clampedIndex]) {
          onSelect(commands[clampedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [commands, clampedIndex, onSelect, onClose]);

  return (
    <div className="absolute bottom-full left-0 w-full mb-2 glass-card rounded-xl border border-border/60 shadow-glass overflow-hidden z-50">
      <div className="max-h-64 overflow-y-auto">
        {commands.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">No commands found</div>
        ) : (
          commands.map((cmd, i) => (
            <button
              key={cmd.command}
              onClick={() => onSelect(cmd)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === clampedIndex
                  ? "bg-primary/10 text-foreground"
                  : "text-foreground hover:bg-accent/50"
              }`}
            >
              <span className="text-muted-foreground shrink-0">
                {cmd.icon ? ICON_MAP[cmd.icon] : null}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight">{cmd.label}</div>
                <div className="text-[11px] text-muted-foreground truncate">{cmd.description}</div>
              </div>
              <span className="ml-auto text-[11px] text-muted-foreground/60 shrink-0 font-mono">
                {cmd.command}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
