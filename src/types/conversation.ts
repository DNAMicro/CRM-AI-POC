export type RichBlockType =
  | "text"
  | "stat-cards"
  | "data-table"
  | "pipeline-board"
  | "activity-timeline"
  | "contact-card"
  | "deal-summary"
  | "action-buttons"
  | "inline-form"
  | "email-list"
  | "email-detail"
  | "email-compose"
  | "sms-thread"
  | "sms-compose"
  | "integration-status"
  | "dynamic-ui"
  | "attachment-list"
  | "task-list"
  | "calendar-events";

export interface StatCard {
  label: string;
  value: string;
  subtext?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon?: string;
}

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  type?: "text" | "currency" | "date" | "status" | "priority" | "badge";
}

export interface DataTableData {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  entityType?: "contact" | "deal";
  idField?: string;
}

export interface FormField {
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "select" | "textarea" | "date" | "number";
  value?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface InlineFormData {
  entityType: "contact" | "deal" | "activity";
  title: string;
  fields: FormField[];
  mode?: "create" | "edit";
  entityId?: string;
}

export interface SlashCommand {
  command: string;
  label: string;
  description: string;
  icon?: string;
  promptTemplate?: string;
  intent?: string;
}

export interface RichBlock {
  type: RichBlockType;
  data: unknown;
}

export interface ChipAction {
  label: string;
  intent: string;
  params?: Record<string, string | undefined>;
}

export interface FileAttachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface AttachmentListData {
  attachments: {
    id: string;
    filename: string;
    url: string;
    size: number;
    mimeType: string;
    contactName?: string;
    dealName?: string;
    uploadedAt: string;
  }[];
}

export interface SqlQuery {
  sql: string;
  /** Positional values, or the named-parameter object for @name placeholders */
  params: unknown[] | Record<string, unknown>;
}

export interface DebugToolCall {
  name: string;
  arguments: Record<string, unknown>;
  /** SQL statements the tool ran, in order */
  sql?: SqlQuery[];
  /** Statements run beyond the logging cap */
  sqlOmitted?: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  richBlocks?: RichBlock[];
  suggestedChips?: ChipAction[];
  attachments?: FileAttachment[];
  debugToolCalls?: DebugToolCall[];
  timestamp: string;
}

export interface CRMContext {
  selectedContactId?: string;
  selectedDealId?: string;
  currentFilter?: { stage?: string };
}

// ===== Email Types =====

export interface EmailListItem {
  id: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  bodyPreview: string;
  isRead: boolean;
  sentAt: string;
  contactName?: string;
  direction: "inbound" | "outbound";
}

export interface EmailListData {
  emails: EmailListItem[];
  totalCount: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface EmailDetailData {
  id: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromAddress: string;
  toAddress: string;
  ccAddress?: string;
  subject: string;
  bodyHtml: string;
  sentAt: string;
  contactName?: string;
  contactId?: string;
  direction: "inbound" | "outbound";
  thread?: EmailDetailData[];
}

export interface EmailComposeData {
  to: string;
  toName?: string;
  contactId?: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  cc?: string;
  inReplyTo?: string;
  threadId?: string;
  mode: "compose" | "reply" | "forward";
}

// ===== SMS Types =====

export interface SmsMessage {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  timestamp: string;
  status?: string;
}

export interface SmsThreadData {
  contactId: string;
  contactName: string;
  contactPhone: string;
  messages: SmsMessage[];
}

export interface SmsComposeData {
  to: string;
  toName?: string;
  contactId?: string;
  body?: string;
}

// ===== Integration Status =====

export interface IntegrationStatusData {
  gmail: {
    configured: boolean;
    connected: boolean;
    email?: string;
  };
  sms: {
    configured: boolean;
    phoneNumber?: string;
  };
  office365: {
    configured: boolean;
    connected: boolean;
    email?: string;
  };
}

// ===== Dynamic UI Primitives =====

export type DynamicUIColor = "indigo" | "emerald" | "amber" | "red" | "violet" | "blue" | "slate";

export type DynamicUINode =
  | DynamicHeading
  | DynamicText
  | DynamicMetric
  | DynamicBadgeGroup
  | DynamicProgressBar
  | DynamicBarChart
  | DynamicTable
  | DynamicList
  | DynamicGrid
  | DynamicStack
  | DynamicCard
  | DynamicDivider
  | DynamicChart
  | DynamicCallout
  | DynamicTimeline
  | DynamicStatRow
  | DynamicKeyValue;

export interface DynamicHeading {
  type: "heading";
  level: 1 | 2 | 3;
  text: string;
}

export interface DynamicText {
  type: "text";
  content: string;
  muted?: boolean;
}

export interface DynamicMetric {
  type: "metric";
  label: string;
  value: string;
  subtext?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}

export interface DynamicBadgeGroup {
  type: "badge-group";
  badges: { text: string; color?: DynamicUIColor }[];
}

export interface DynamicProgressBar {
  type: "progress-bar";
  label: string;
  value: number;
  color?: DynamicUIColor;
  showValue?: boolean;
  suffix?: string;
}

export interface DynamicBarChart {
  type: "bar-chart";
  title?: string;
  bars: { label: string; value: number; color?: DynamicUIColor }[];
  maxValue?: number;
}

export interface DynamicTable {
  type: "table";
  headers: string[];
  rows: string[][];
}

export interface DynamicList {
  type: "list";
  items: { label: string; value?: string }[];
  ordered?: boolean;
}

export interface DynamicGrid {
  type: "grid";
  columns: 1 | 2 | 3 | 4;
  children: DynamicUINode[];
}

export interface DynamicStack {
  type: "stack";
  direction: "vertical" | "horizontal";
  gap?: "sm" | "md" | "lg";
  children: DynamicUINode[];
}

export interface DynamicCard {
  type: "card";
  title?: string;
  children: DynamicUINode[];
}

export interface DynamicDivider {
  type: "divider";
}

export interface DynamicChart {
  type: "chart";
  chartType: "pie" | "donut" | "line" | "area" | "vertical-bar";
  data: { label: string; value: number; color?: DynamicUIColor }[];
  title?: string;
  showLegend?: boolean;
  showValues?: boolean;
}

export interface DynamicCallout {
  type: "callout";
  variant: "info" | "warning" | "success" | "error";
  title?: string;
  content: string;
}

export interface DynamicTimeline {
  type: "timeline";
  items: { label: string; description?: string; timestamp?: string; color?: DynamicUIColor }[];
}

export interface DynamicStatRow {
  type: "stat-row";
  stats: { label: string; value: string; change?: string; trend?: "up" | "down" | "neutral" }[];
}

export interface DynamicKeyValue {
  type: "key-value";
  pairs: { key: string; value: string }[];
  columns?: 1 | 2 | 3;
}

export interface DynamicUIData {
  title?: string;
  description?: string;
  layout: DynamicUINode;
}

// ===== Task List =====

export interface TaskListData {
  tasks: import("@/types/crm").Task[];
  title?: string;
  overdueCount?: number;
  dueTodayCount?: number;
  upcomingCount?: number;
}

// ===== Calendar Events =====

export interface CalendarEventItem {
  id: string;
  subject: string;
  startTime: string;
  endTime: string;
  location: string;
  isAllDay: boolean;
  organizerName: string;
  attendees: { email: string; name: string; response: string }[];
  contactId?: string;
  contactName?: string;
  webLink: string;
}

export interface CalendarEventsData {
  events: CalendarEventItem[];
  dateRange?: string;
}

// ===== Pinned Items =====

export interface PinnedItem {
  id: string;
  block: RichBlock;
  pinnedAt: string;
}
