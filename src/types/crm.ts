export type PipelineStage =
  | "lead"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "closed-won"
  | "closed-lost";

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  phone: string;
  avatar: string;
  status: "active" | "inactive" | "churned";
  tags: string[];
  lastContactedAt: string;
  createdAt: string;
}

export interface Deal {
  id: string;
  name: string;
  contactId: string;
  company: string;
  value: number;
  stage: PipelineStage;
  probability: number;
  closeDate: string;
  assignedTo: string;
  priority: "high" | "medium" | "low";
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  type: "call" | "email" | "meeting" | "note" | "task" | "deal-update";
  contactId: string;
  dealId?: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  dueTime: string | null;
  status: "pending" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
  contactId: string | null;
  dealId: string | null;
  completedAt: string | null;
  reminderMinutes: number | null;
  reminderFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
  contactName?: string;
  dealName?: string;
}
