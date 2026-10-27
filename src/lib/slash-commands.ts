import type { SlashCommand } from "@/types/conversation";

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: "/new-contact", label: "New Contact", description: "Create a new contact", icon: "UserPlus", promptTemplate: "Create a new contact" },
  { command: "/new-deal", label: "New Deal", description: "Create a new deal", icon: "PlusCircle", promptTemplate: "Create a new deal" },
  { command: "/log-activity", label: "Log Activity", description: "Log a call, email, or meeting", icon: "Activity", promptTemplate: "Log a " },
  { command: "/show-pipeline", label: "Show Pipeline", description: "View the deal pipeline board", icon: "LayoutDashboard", intent: "pipeline-kanban" },
  { command: "/search", label: "Search", description: "Search contacts and deals", icon: "Search", promptTemplate: "Search for " },
  { command: "/follow-ups", label: "Follow-ups", description: "Contacts needing follow-up", icon: "Bell", intent: "follow-ups" },
  { command: "/dashboard", label: "Dashboard", description: "Show dashboard overview", icon: "BarChart3", intent: "show-pipeline" },
  { command: "/help", label: "Help", description: "What can this CRM AI do?", icon: "HelpCircle", promptTemplate: "What can you help me with?" },
  { command: "/inbox", label: "Inbox", description: "View your email inbox", icon: "Inbox", intent: "show-inbox" },
  { command: "/compose", label: "Compose Email", description: "Draft and send an email", icon: "Mail", promptTemplate: "Compose an email to " },
  { command: "/sms", label: "Send SMS", description: "Send a text message", icon: "MessageSquare", promptTemplate: "Send an SMS to " },
  { command: "/settings", label: "Settings", description: "Configure integrations", icon: "Settings", intent: "open-settings" },
];

export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase().replace(/^\//, "");
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (cmd) => cmd.command.toLowerCase().includes(q) || cmd.label.toLowerCase().includes(q)
  );
}
