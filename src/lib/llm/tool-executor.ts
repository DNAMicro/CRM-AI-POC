import fs from "fs";
import path from "path";
import type { RichBlock, StatCard, DataTableData, TableColumn, InlineFormData, FormField, DynamicUIData, DynamicUINode, DynamicUIColor, AttachmentListData } from "@/types/conversation";
import type { EmailListData, EmailDetailData, EmailComposeData, IntegrationStatusData } from "@/types/conversation";
import type { SmsThreadData, SmsComposeData } from "@/types/conversation";
import type { CalendarEventsData, CalendarEventItem } from "@/types/conversation";
import { isSmsConfigured } from "@/lib/sms";
import type { Activity, Deal, PipelineStage } from "@/types/crm";
import * as db from "@/lib/db";
import * as gmail from "@/lib/gmail";
import * as office365 from "@/lib/office365";
import * as followUps from "@/lib/follow-ups";
import * as intelligence from "@/lib/intelligence";
import * as analytics from "@/lib/analytics";
import { getIntegrationStatus } from "@/lib/settings";
import { STAGE_LABELS, PIPELINE_STAGES } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";

// Must match the directory used by /api/files/upload and /api/files/[id]
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

interface ToolResult {
  richBlocks: RichBlock[];
  rawData: unknown;
}

const CHART_COLORS: DynamicUIColor[] = ["indigo", "emerald", "amber", "violet", "blue", "red"];
function chartColor(index: number): DynamicUIColor { return CHART_COLORS[index % CHART_COLORS.length]; }

/** Enrich activities with contact names so the client doesn't need static data lookups */
function enrichActivities(activities: Activity[]) {
  return activities.map((a) => {
    const contact = a.contactId ? db.getContact(a.contactId) : undefined;
    return {
      ...a,
      contactName: contact ? `${contact.firstName} ${contact.lastName}` : undefined,
    };
  });
}

export function executeTool(name: string, args: Record<string, unknown>): ToolResult {
  switch (name) {
    case "get_dashboard_stats":
      return execDashboardStats();
    case "query_contacts":
      return execQueryContacts(args);
    case "get_contact_detail":
      return execContactDetail(args);
    case "query_deals":
      return execQueryDeals(args);
    case "get_deal_detail":
      return execDealDetail(args);
    case "get_pipeline_board":
      return execPipelineBoard();
    case "get_recent_activities":
      return execRecentActivities(args);
    case "run_custom_query":
      return execCustomQuery(args);
    case "prepare_form":
      return execPrepareForm(args);
    case "update_contact":
      return execUpdateContact(args);
    case "update_deal":
      return execUpdateDeal(args);
    case "delete_entity":
      return execDeleteEntity(args);
    case "prepare_edit_form":
      return execPrepareEditForm(args);
    case "send_email":
      return execSendEmail(args);
    case "get_emails":
      return execGetEmails(args);
    case "get_email_thread":
      return execGetEmailThread(args);
    case "check_integrations_status":
      return execCheckIntegrations();
    case "send_sms":
      return execSendSms(args);
    case "get_sms_history":
      return execGetSmsHistory(args);
    case "generate_dynamic_ui":
      return execGenerateDynamicUI(args);
    case "attach_file":
      return execAttachFile(args);
    case "get_attachments":
      return execGetAttachments(args);
    case "create_task":
      return execCreateTask(args);
    case "get_tasks":
      return execGetTasks(args);
    case "complete_task":
      return execCompleteTask(args);
    case "global_search":
      return execGlobalSearch(args);
    case "import_contacts":
      return execImportContacts(args);
    case "export_contacts":
      return execExportContacts(args);
    case "bulk_update":
      return execBulkUpdate(args);
    case "generate_pipeline_report":
      return execPipelineReport();
    case "generate_activity_report":
      return execActivityReport(args);
    case "send_outlook_email":
      return execSendOutlookEmail(args);
    case "get_outlook_inbox":
      return execGetOutlookInbox(args);
    case "get_outlook_thread":
      return execGetOutlookThread(args);
    case "get_calendar_events":
      return execGetCalendarEvents(args);
    case "create_calendar_event":
      return execCreateCalendarEvent(args);
    case "import_outlook_contacts":
      return execImportOutlookContacts();
    case "get_stale_deals":
      return execGetStaleDeals(args);
    case "get_follow_up_suggestions":
      return execGetFollowUpSuggestions(args);
    case "get_next_actions":
      return execGetNextActions(args);
    case "create_email_template":
      return execCreateEmailTemplate(args);
    case "list_email_templates":
      return execListEmailTemplates();
    case "apply_email_template":
      return execApplyEmailTemplate(args);
    case "schedule_message":
      return execScheduleMessage(args);
    case "get_morning_briefing":
      return execGetMorningBriefing();
    case "get_lead_scores":
      return execGetLeadScores(args);
    case "get_deal_health":
      return execGetDealHealth(args);
    case "get_relationship_map":
      return execGetRelationshipMap(args);
    case "get_sales_insights":
      return execGetSalesInsights();
    case "get_pipeline_trends":
      return execGetPipelineTrends(args);
    case "get_revenue_forecast":
      return execGetRevenueForecast(args);
    case "get_sales_velocity":
      return execGetSalesVelocity();
    case "get_win_loss_analysis":
      return execGetWinLossAnalysis(args);
    case "get_activity_trends":
      return execGetActivityTrends(args);
    case "export_report":
      return execExportReport(args);
    default:
      return { richBlocks: [], rawData: { error: `Unknown tool: ${name}` } };
  }
}

function execDashboardStats(): ToolResult {
  const stats = db.getDashboardStats();

  const statCards: StatCard[] = [
    { label: "Active Deals", value: stats.activeDealsCount.toString(), subtext: `${formatCurrency(stats.pipelineValue)} pipeline`, trend: "up", trendValue: "+3 this month" },
    { label: "Closing This Month", value: stats.closingThisMonthCount.toString(), subtext: formatCurrency(stats.closingThisMonthValue) },
    { label: "Follow-ups Needed", value: stats.followUpsNeededCount.toString(), subtext: "Contacts not reached in 5+ days", trend: stats.followUpsNeededCount > 3 ? "down" : "neutral" },
    { label: "Weighted Pipeline", value: formatCurrency(stats.weightedPipelineValue), subtext: "Probability-adjusted value", trend: "up", trendValue: "+12%" },
  ];

  return {
    richBlocks: [{ type: "stat-cards", data: statCards }],
    rawData: stats,
  };
}

function execQueryContacts(args: Record<string, unknown>): ToolResult {
  let contacts;
  if (args.needs_follow_up) {
    contacts = db.getContactsNeedingFollowUp();
  } else if (args.search) {
    contacts = db.searchContacts(String(args.search));
  } else {
    contacts = db.getAllContacts();
  }

  if (args.status) {
    contacts = contacts.filter((c) => c.status === args.status);
  }

  const tableData: DataTableData = {
    columns: [
      { key: "name", label: "Name", sortable: true },
      { key: "company", label: "Company", sortable: true },
      { key: "title", label: "Title" },
      { key: "status", label: "Status", type: "status" },
      { key: "lastContactedAt", label: "Last Contact", sortable: true, type: "date" },
    ],
    rows: contacts.map((c) => ({ ...c, name: `${c.firstName} ${c.lastName}` })),
    entityType: "contact",
    idField: "id",
  };

  return {
    richBlocks: [{ type: "data-table", data: tableData }],
    rawData: { count: contacts.length, contacts },
  };
}

function execContactDetail(args: Record<string, unknown>): ToolResult {
  let contact;
  if (args.contact_id) {
    contact = db.getContact(String(args.contact_id));
  } else if (args.name) {
    const matches = db.searchContacts(String(args.name));
    contact = matches[0];
  }

  if (!contact) {
    return { richBlocks: [], rawData: { error: "Contact not found" } };
  }

  const deals = db.getDealsByContact(contact.id);
  const activities = db.getActivitiesByContact(contact.id);

  return {
    richBlocks: [
      { type: "contact-card", data: { contact, deals } },
      ...(activities.length > 0 ? [{ type: "activity-timeline" as const, data: enrichActivities(activities.slice(0, 5)) }] : []),
    ],
    rawData: { contact, deals, activities: activities.slice(0, 5) },
  };
}

function execQueryDeals(args: Record<string, unknown>): ToolResult {
  let dealsList: Deal[];

  if (args.closing_this_month) {
    dealsList = db.getDealsClosingThisMonth();
  } else if (args.stage) {
    dealsList = db.getDealsByStage(String(args.stage) as PipelineStage);
  } else if (args.contact_id) {
    dealsList = db.getDealsByContact(String(args.contact_id));
  } else if (args.active_only) {
    dealsList = db.getActiveDeals();
  } else {
    dealsList = db.getAllDeals();
  }

  if (args.priority) {
    dealsList = dealsList.filter((d) => d.priority === args.priority);
  }
  if (args.min_value !== undefined) {
    dealsList = dealsList.filter((d) => d.value >= Number(args.min_value));
  }
  if (args.max_value !== undefined) {
    dealsList = dealsList.filter((d) => d.value <= Number(args.max_value));
  }

  // If querying by stage, add stage-level stat cards
  const richBlocks: RichBlock[] = [];

  if (!args.stage && !args.closing_this_month && !args.contact_id) {
    // Full pipeline view — add stat cards per stage
    const stageCounts = PIPELINE_STAGES.map((s) => {
      const stageDeals = dealsList.filter((d) => d.stage === s);
      return { stage: s, count: stageDeals.length, value: stageDeals.reduce((sum, d) => sum + d.value, 0) };
    }).filter((s) => s.count > 0);

    const statCards: StatCard[] = stageCounts.map((s) => ({
      label: STAGE_LABELS[s.stage],
      value: s.count.toString(),
      subtext: formatCurrency(s.value),
    }));

    if (statCards.length > 0) {
      richBlocks.push({ type: "stat-cards", data: statCards });
    }
  }

  const tableData: DataTableData = {
    columns: [
      { key: "name", label: "Deal", sortable: true },
      { key: "company", label: "Company", sortable: true },
      { key: "value", label: "Value", sortable: true, type: "currency" },
      { key: "stage", label: "Stage", sortable: true, type: "status" },
      { key: "priority", label: "Priority", type: "priority" },
      { key: "closeDate", label: "Close Date", sortable: true, type: "date" },
    ],
    rows: dealsList.map((d) => ({ ...d })),
    entityType: "deal",
    idField: "id",
  };

  richBlocks.push({ type: "data-table", data: tableData });

  return {
    richBlocks,
    rawData: { count: dealsList.length, totalValue: dealsList.reduce((s, d) => s + d.value, 0), deals: dealsList },
  };
}

function execDealDetail(args: Record<string, unknown>): ToolResult {
  let deal;
  if (args.deal_id) {
    deal = db.getDeal(String(args.deal_id));
  } else if (args.company) {
    const all = db.getAllDeals();
    deal = all.find((d) => d.company.toLowerCase().includes(String(args.company).toLowerCase()));
  }

  if (!deal) {
    return { richBlocks: [], rawData: { error: "Deal not found" } };
  }

  const contact = db.getContact(deal.contactId);
  const activities = db.getActivitiesByDeal(deal.id);

  return {
    richBlocks: [
      { type: "deal-summary", data: { deal, contact } },
      ...(activities.length > 0 ? [{ type: "activity-timeline" as const, data: enrichActivities(activities.slice(0, 5)) }] : []),
      {
        type: "action-buttons",
        data: [
          { label: "Log a Call", intent: "log-call", params: { dealId: deal.id } },
          { label: "Send Email", intent: "send-email", params: { contactId: deal.contactId } },
          { label: "Update Stage", intent: "update-stage", params: { dealId: deal.id } },
        ],
      },
    ],
    rawData: { deal, contact, activities: activities.slice(0, 5) },
  };
}

function execPipelineBoard(): ToolResult {
  const stages = PIPELINE_STAGES.filter((s) => s !== "closed-lost").map((stage) => {
    const stageDeals = db.getDealsByStage(stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      deals: stageDeals.map((d) => ({
        id: d.id,
        name: d.name,
        company: d.company,
        value: d.value,
        closeDate: d.closeDate,
        priority: d.priority,
      })),
      totalValue: stageDeals.reduce((s, d) => s + d.value, 0),
    };
  });

  return {
    richBlocks: [{ type: "pipeline-board", data: stages }],
    rawData: { stages: stages.map((s) => ({ stage: s.stage, count: s.deals.length, totalValue: s.totalValue })) },
  };
}

function execRecentActivities(args: Record<string, unknown>): ToolResult {
  const limit = Number(args.limit) || 10;
  let activities;

  if (args.contact_id) {
    activities = db.getActivitiesByContact(String(args.contact_id)).slice(0, limit);
  } else if (args.deal_id) {
    activities = db.getActivitiesByDeal(String(args.deal_id)).slice(0, limit);
  } else {
    activities = db.getRecentActivities(limit);
  }

  return {
    richBlocks: [{ type: "activity-timeline", data: enrichActivities(activities) }],
    rawData: { count: activities.length, activities },
  };
}

function execCustomQuery(args: Record<string, unknown>): ToolResult {
  const sql = String(args.sql || "");
  const columnDefs = (args.columns || []) as { key: string; label: string; type?: string }[];

  try {
    const rows = db.runCustomQuery(sql);

    const columns: TableColumn[] = columnDefs.map((col) => ({
      key: col.key,
      label: col.label,
      sortable: true,
      ...(col.type ? { type: col.type as TableColumn["type"] } : {}),
    }));

    const tableData: DataTableData = {
      columns,
      rows: rows as Record<string, unknown>[],
    };

    return {
      richBlocks: [{ type: "data-table", data: tableData }],
      rawData: { count: rows.length, rows },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return {
      richBlocks: [],
      rawData: { error: message, sql },
    };
  }
}

function execPrepareForm(args: Record<string, unknown>): ToolResult {
  const entityType = String(args.entity_type) as "contact" | "deal" | "activity";
  const prefill = (args.prefill || {}) as Record<string, string>;

  let fields: FormField[];
  let title: string;

  switch (entityType) {
    case "contact":
      title = "New Contact";
      fields = [
        { key: "firstName", label: "First Name", type: "text", required: true, value: prefill.firstName || "", placeholder: "e.g. Jane" },
        { key: "lastName", label: "Last Name", type: "text", required: true, value: prefill.lastName || "", placeholder: "e.g. Smith" },
        { key: "email", label: "Email", type: "email", value: prefill.email || "", placeholder: "e.g. jane@company.com" },
        { key: "company", label: "Company", type: "text", required: true, value: prefill.company || "", placeholder: "e.g. Acme Corp" },
        { key: "title", label: "Job Title", type: "text", value: prefill.title || "", placeholder: "e.g. VP of Sales" },
        { key: "phone", label: "Phone", type: "phone", value: prefill.phone || "", placeholder: "e.g. (415) 555-0100" },
        {
          key: "status", label: "Status", type: "select", value: prefill.status || "active",
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "churned", label: "Churned" },
          ],
        },
        { key: "tags", label: "Tags", type: "text", value: prefill.tags || "", placeholder: "e.g. enterprise, tech (comma-separated)" },
      ];
      break;

    case "deal":
      title = "New Deal";
      fields = [
        { key: "name", label: "Deal Name", type: "text", required: true, value: prefill.name || "", placeholder: "e.g. Enterprise License" },
        { key: "company", label: "Company", type: "text", required: true, value: prefill.company || "", placeholder: "e.g. Acme Corp" },
        { key: "value", label: "Value ($)", type: "number", required: true, value: prefill.value || "", placeholder: "e.g. 50000" },
        {
          key: "stage", label: "Stage", type: "select", value: prefill.stage || "lead",
          options: PIPELINE_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
        },
        {
          key: "priority", label: "Priority", type: "select", value: prefill.priority || "medium",
          options: [
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ],
        },
        { key: "probability", label: "Probability (%)", type: "number", value: prefill.probability || "20", placeholder: "0-100" },
        { key: "closeDate", label: "Close Date", type: "date", value: prefill.closeDate || "" },
        { key: "contactId", label: "Contact", type: "select", value: prefill.contactId || "",
          options: [{ value: "", label: "(none)" }, ...db.getAllContacts().map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName} — ${c.company}` }))],
        },
      ];
      break;

    case "activity":
      title = "Log Activity";
      fields = [
        {
          key: "type", label: "Type", type: "select", required: true, value: prefill.type || "call",
          options: [
            { value: "call", label: "Call" },
            { value: "email", label: "Email" },
            { value: "meeting", label: "Meeting" },
            { value: "note", label: "Note" },
            { value: "task", label: "Task" },
            { value: "deal-update", label: "Deal Update" },
          ],
        },
        { key: "contactId", label: "Contact", type: "select", required: true, value: prefill.contactId || "",
          options: db.getAllContacts().map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName} — ${c.company}` })),
        },
        { key: "dealId", label: "Deal ID", type: "text", value: prefill.dealId || "", placeholder: "e.g. d1 (optional)" },
        { key: "description", label: "Description", type: "textarea", required: true, value: prefill.description || "", placeholder: "What happened?" },
      ];
      break;

    default:
      return { richBlocks: [], rawData: { error: `Unknown entity type: ${entityType}` } };
  }

  const formData: InlineFormData = { entityType, title, fields };

  return {
    richBlocks: [{ type: "inline-form", data: formData }],
    rawData: { formPrepared: true, entityType, prefill },
  };
}

function execUpdateContact(args: Record<string, unknown>): ToolResult {
  const contact = db.updateContact(String(args.contact_id), args.updates as Record<string, unknown>);
  if (!contact) {
    return { richBlocks: [], rawData: { error: "Contact not found" } };
  }
  const deals = db.getDealsByContact(contact.id);
  return {
    richBlocks: [{ type: "contact-card", data: { contact, deals } }],
    rawData: { contact, updated: true },
  };
}

function execUpdateDeal(args: Record<string, unknown>): ToolResult {
  const deal = db.updateDeal(String(args.deal_id), args.updates as Record<string, unknown>);
  if (!deal) {
    return { richBlocks: [], rawData: { error: "Deal not found" } };
  }
  const contact = db.getContact(deal.contactId);
  return {
    richBlocks: [{ type: "deal-summary", data: { deal, contact } }],
    rawData: { deal, updated: true },
  };
}

function execDeleteEntity(args: Record<string, unknown>): ToolResult {
  const entityType = String(args.entity_type) as "contact" | "deal" | "activity";
  const entityId = String(args.entity_id);

  let result: { success: boolean; error?: string };
  switch (entityType) {
    case "contact":
      result = db.deleteContact(entityId);
      break;
    case "deal":
      result = db.deleteDeal(entityId);
      break;
    case "activity":
      result = db.deleteActivity(entityId);
      break;
    default:
      return { richBlocks: [], rawData: { error: `Unknown entity type: ${entityType}` } };
  }

  if (!result.success) {
    return { richBlocks: [], rawData: { error: result.error } };
  }
  return { richBlocks: [], rawData: { deleted: true, entityType, entityId } };
}

function execPrepareEditForm(args: Record<string, unknown>): ToolResult {
  const entityType = String(args.entity_type) as "contact" | "deal";
  const entityId = String(args.entity_id);

  let fields: FormField[];
  let title: string;

  switch (entityType) {
    case "contact": {
      const contact = db.getContact(entityId);
      if (!contact) {
        return { richBlocks: [], rawData: { error: "Contact not found" } };
      }
      title = "Edit Contact";
      fields = [
        { key: "firstName", label: "First Name", type: "text", required: true, value: contact.firstName, placeholder: "e.g. Jane" },
        { key: "lastName", label: "Last Name", type: "text", required: true, value: contact.lastName, placeholder: "e.g. Smith" },
        { key: "email", label: "Email", type: "email", value: contact.email, placeholder: "e.g. jane@company.com" },
        { key: "company", label: "Company", type: "text", required: true, value: contact.company, placeholder: "e.g. Acme Corp" },
        { key: "title", label: "Job Title", type: "text", value: contact.title, placeholder: "e.g. VP of Sales" },
        { key: "phone", label: "Phone", type: "phone", value: contact.phone, placeholder: "e.g. (415) 555-0100" },
        {
          key: "status", label: "Status", type: "select", value: contact.status,
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "churned", label: "Churned" },
          ],
        },
        { key: "tags", label: "Tags", type: "text", value: Array.isArray(contact.tags) ? contact.tags.join(", ") : contact.tags || "", placeholder: "e.g. enterprise, tech (comma-separated)" },
      ];
      break;
    }

    case "deal": {
      const deal = db.getDeal(entityId);
      if (!deal) {
        return { richBlocks: [], rawData: { error: "Deal not found" } };
      }
      title = "Edit Deal";
      fields = [
        { key: "name", label: "Deal Name", type: "text", required: true, value: deal.name, placeholder: "e.g. Enterprise License" },
        { key: "company", label: "Company", type: "text", required: true, value: deal.company, placeholder: "e.g. Acme Corp" },
        { key: "value", label: "Value ($)", type: "number", required: true, value: String(deal.value), placeholder: "e.g. 50000" },
        {
          key: "stage", label: "Stage", type: "select", value: deal.stage,
          options: PIPELINE_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
        },
        {
          key: "priority", label: "Priority", type: "select", value: deal.priority,
          options: [
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ],
        },
        { key: "probability", label: "Probability (%)", type: "number", value: String(deal.probability), placeholder: "0-100" },
        { key: "closeDate", label: "Close Date", type: "date", value: deal.closeDate ? deal.closeDate.split("T")[0] : "" },
        { key: "contactId", label: "Contact ID", type: "text", value: deal.contactId, placeholder: "e.g. c1 (optional)" },
      ];
      break;
    }

    default:
      return { richBlocks: [], rawData: { error: `Unknown entity type: ${entityType}` } };
  }

  const formData: InlineFormData = { entityType, title, fields, mode: "edit", entityId };

  return {
    richBlocks: [{ type: "inline-form", data: formData }],
    rawData: { formPrepared: true, entityType, mode: "edit" },
  };
}

function execSendEmail(args: Record<string, unknown>): ToolResult {
  // Check if Gmail is connected
  if (!gmail.isGmailConnected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Gmail not connected. Please connect Gmail in Settings first." },
    };
  }

  // Look up contact if needed
  let contactId = args.contact_id ? String(args.contact_id) : undefined;
  let contactEmail = "";
  let contactName = "";

  if (contactId) {
    const contact = db.getContact(contactId);
    if (contact) {
      contactEmail = contact.email;
      contactName = `${contact.firstName} ${contact.lastName}`;
    }
  } else if (args.contact_name) {
    const matches = db.searchContacts(String(args.contact_name));
    if (matches.length > 0) {
      contactId = matches[0].id;
      contactEmail = matches[0].email;
      contactName = `${matches[0].firstName} ${matches[0].lastName}`;
    }
  }

  if (!contactEmail && !args.contact_name) {
    return { richBlocks: [], rawData: { error: "No contact email found. Please specify a contact." } };
  }

  const composeData: EmailComposeData = {
    to: contactEmail,
    toName: contactName || undefined,
    contactId: contactId || undefined,
    subject: String(args.subject || ""),
    bodyHtml: String(args.body_html || ""),
    bodyText: String(args.body_text || args.body_html || "").replace(/<[^>]*>/g, ""),
    inReplyTo: args.in_reply_to ? String(args.in_reply_to) : undefined,
    mode: args.in_reply_to ? "reply" : "compose",
  };

  return {
    richBlocks: [{ type: "email-compose", data: composeData }],
    rawData: { composePrepared: true, to: contactEmail, subject: composeData.subject },
  };
}

function execGetEmails(args: Record<string, unknown>): ToolResult {
  if (!gmail.isGmailConnected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Gmail not connected. Please connect Gmail in Settings first." },
    };
  }

  // Resolve contact if name provided
  let contactId = args.contact_id ? String(args.contact_id) : undefined;
  if (!contactId && args.contact_name) {
    const matches = db.searchContacts(String(args.contact_name));
    if (matches.length > 0) {
      contactId = matches[0].id;
    }
  }

  const limit = Number(args.limit) || 15;
  const unreadOnly = Boolean(args.unread_only);

  const result = db.getEmails({
    contactId,
    unreadOnly,
    page: 1,
    pageSize: limit,
  });

  const emailListData: EmailListData = {
    emails: result.emails.map((e) => ({
      id: e.id,
      gmailMessageId: e.gmailMessageId,
      gmailThreadId: e.gmailThreadId,
      fromAddress: e.fromAddress,
      toAddress: e.toAddress,
      subject: e.subject,
      bodyPreview: (e.bodyText || e.bodyHtml.replace(/<[^>]*>/g, "")).slice(0, 120),
      isRead: Boolean(e.isRead),
      sentAt: e.sentAt,
      contactName: contactId ? (() => { const c = db.getContact(contactId!); return c ? `${c.firstName} ${c.lastName}` : undefined; })() : undefined,
      direction: e.direction,
    })),
    totalCount: result.totalCount,
    unreadCount: result.unreadCount,
    page: 1,
    pageSize: limit,
    hasMore: limit < result.totalCount,
  };

  return {
    richBlocks: [{ type: "email-list", data: emailListData }],
    rawData: { count: result.emails.length, totalCount: result.totalCount, unreadCount: result.unreadCount },
  };
}

function execGetEmailThread(args: Record<string, unknown>): ToolResult {
  if (!gmail.isGmailConnected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Gmail not connected. Please connect Gmail in Settings first." },
    };
  }

  const threadId = String(args.thread_id);
  const emails = db.getEmailThread(threadId);

  if (emails.length === 0) {
    return { richBlocks: [], rawData: { error: "Email thread not found" } };
  }

  // The latest email is the main one, earlier ones are the thread
  const latest = emails[emails.length - 1];
  const thread = emails.slice(0, -1);

  const resolveContactName = (emailAddr: string) => {
    const addr = emailAddr.match(/<([^>]+)>/)?.[1] || emailAddr.trim();
    const contacts = db.getAllContacts();
    const contact = contacts.find(c => c.email.toLowerCase() === addr.toLowerCase());
    return contact ? `${contact.firstName} ${contact.lastName}` : undefined;
  };

  const emailDetailData: EmailDetailData = {
    id: latest.id,
    gmailMessageId: latest.gmailMessageId,
    gmailThreadId: latest.gmailThreadId,
    fromAddress: latest.fromAddress,
    toAddress: latest.toAddress,
    ccAddress: latest.ccAddress || undefined,
    subject: latest.subject,
    bodyHtml: latest.bodyHtml,
    sentAt: latest.sentAt,
    contactName: resolveContactName(latest.direction === "inbound" ? latest.fromAddress : latest.toAddress),
    contactId: latest.contactId || undefined,
    direction: latest.direction,
    thread: thread.length > 0 ? thread.map(e => ({
      id: e.id,
      gmailMessageId: e.gmailMessageId,
      gmailThreadId: e.gmailThreadId,
      fromAddress: e.fromAddress,
      toAddress: e.toAddress,
      ccAddress: e.ccAddress || undefined,
      subject: e.subject,
      bodyHtml: e.bodyHtml,
      sentAt: e.sentAt,
      contactName: resolveContactName(e.direction === "inbound" ? e.fromAddress : e.toAddress),
      contactId: e.contactId || undefined,
      direction: e.direction,
    })) : undefined,
  };

  return {
    richBlocks: [{ type: "email-detail", data: emailDetailData }],
    rawData: { emailCount: emails.length, threadId },
  };
}

function execCheckIntegrations(): ToolResult {
  const status = getIntegrationStatus();
  const statusData: IntegrationStatusData = status;

  return {
    richBlocks: [{ type: "integration-status", data: statusData }],
    rawData: status,
  };
}

function execSendSms(args: Record<string, unknown>): ToolResult {
  if (!isSmsConfigured()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "SMS not configured. Please set up Twilio in Settings." },
    };
  }

  // Look up contact
  let contactId = args.contact_id ? String(args.contact_id) : undefined;
  let contactPhone = "";
  let contactName = "";

  if (contactId) {
    const contact = db.getContact(contactId);
    if (contact) {
      contactPhone = contact.phone;
      contactName = `${contact.firstName} ${contact.lastName}`;
    }
  } else if (args.contact_name) {
    const matches = db.searchContacts(String(args.contact_name));
    if (matches.length > 0) {
      contactId = matches[0].id;
      contactPhone = matches[0].phone;
      contactName = `${matches[0].firstName} ${matches[0].lastName}`;
    }
  }

  if (!contactPhone) {
    return { richBlocks: [], rawData: { error: "Contact has no phone number. Please update the contact with a phone number first." } };
  }

  const composeData: SmsComposeData = {
    to: contactPhone,
    toName: contactName || undefined,
    contactId: contactId || undefined,
    body: String(args.message || ""),
  };

  return {
    richBlocks: [{ type: "sms-compose", data: composeData }],
    rawData: { composePrepared: true, to: contactPhone, body: composeData.body },
  };
}

function execGetSmsHistory(args: Record<string, unknown>): ToolResult {
  if (!isSmsConfigured()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "SMS not configured. Please set up Twilio in Settings." },
    };
  }

  let contactId = args.contact_id ? String(args.contact_id) : undefined;
  let contactName = "";
  let contactPhone = "";

  if (!contactId && args.contact_name) {
    const matches = db.searchContacts(String(args.contact_name));
    if (matches.length > 0) {
      contactId = matches[0].id;
    }
  }

  if (!contactId) {
    return { richBlocks: [], rawData: { error: "Contact not found" } };
  }

  const contact = db.getContact(contactId);
  if (contact) {
    contactName = `${contact.firstName} ${contact.lastName}`;
    contactPhone = contact.phone;
  }

  const limit = Number(args.limit) || 50;
  const result = db.getSmsByContact(contactId, { page: 1, pageSize: limit });

  const threadData: SmsThreadData = {
    contactId,
    contactName,
    contactPhone,
    messages: result.messages.map(m => ({
      id: m.id,
      body: m.body,
      direction: m.direction,
      timestamp: m.sentAt,
      status: m.status || undefined,
    })),
  };

  return {
    richBlocks: [{ type: "sms-thread", data: threadData }],
    rawData: { count: result.messages.length, contactId },
  };
}

function execGenerateDynamicUI(args: Record<string, unknown>): ToolResult {
  const layout = args.layout as DynamicUINode | undefined;
  if (!layout || typeof layout !== "object" || !("type" in layout)) {
    return {
      richBlocks: [],
      rawData: { error: "Invalid layout: must be a UI node object with a 'type' property" },
    };
  }

  const dynamicData: DynamicUIData = {
    title: args.title ? String(args.title) : undefined,
    description: args.description ? String(args.description) : undefined,
    layout,
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: dynamicData }],
    rawData: { rendered: true, title: dynamicData.title },
  };
}

function execAttachFile(args: Record<string, unknown>): ToolResult {
  const fileId = String(args.file_id || "");
  if (!fileId) {
    return { richBlocks: [], rawData: { error: "file_id is required" } };
  }

  const attachment = db.getAttachment(fileId);
  if (!attachment) {
    return { richBlocks: [], rawData: { error: `File not found: ${fileId}` } };
  }

  // Resolve contact
  let contactId = args.contact_id ? String(args.contact_id) : undefined;
  let contactName = "";
  if (!contactId && args.contact_name) {
    const matches = db.searchContacts(String(args.contact_name));
    if (matches.length > 0) {
      contactId = matches[0].id;
      contactName = `${matches[0].firstName} ${matches[0].lastName}`;
    }
  }
  if (contactId && !contactName) {
    const c = db.getContact(contactId);
    if (c) contactName = `${c.firstName} ${c.lastName}`;
  }

  const dealId = args.deal_id ? String(args.deal_id) : undefined;
  let dealName = "";
  if (dealId) {
    const d = db.getDeal(dealId);
    if (d) dealName = d.name;
  }

  const description = args.description ? String(args.description) : undefined;

  const updated = db.linkAttachment(fileId, { contactId, dealId, description });
  if (!updated) {
    return { richBlocks: [], rawData: { error: "Failed to link attachment" } };
  }

  // Log activity if we have a contact
  if (contactId) {
    db.insertActivity({
      type: "note",
      contactId,
      dealId: dealId || undefined,
      description: `File attached: ${updated.originalName}${description ? ` — ${description}` : ""}`,
    });
  }

  const listData: AttachmentListData = {
    attachments: [{
      id: updated.id,
      filename: updated.originalName,
      url: updated.url,
      size: updated.size,
      mimeType: updated.mimeType,
      contactName: contactName || undefined,
      dealName: dealName || undefined,
      uploadedAt: updated.uploadedAt,
    }],
  };

  return {
    richBlocks: [{ type: "attachment-list", data: listData }],
    rawData: { attached: true, fileId: updated.id, contactId, dealId },
  };
}

function execGetAttachments(args: Record<string, unknown>): ToolResult {
  let contactId = args.contact_id ? String(args.contact_id) : undefined;
  let contactName = "";

  if (!contactId && args.contact_name) {
    const matches = db.searchContacts(String(args.contact_name));
    if (matches.length > 0) {
      contactId = matches[0].id;
      contactName = `${matches[0].firstName} ${matches[0].lastName}`;
    }
  }
  if (contactId && !contactName) {
    const c = db.getContact(contactId);
    if (c) contactName = `${c.firstName} ${c.lastName}`;
  }

  const dealId = args.deal_id ? String(args.deal_id) : undefined;
  let dealName = "";
  if (dealId) {
    const d = db.getDeal(dealId);
    if (d) dealName = d.name;
  }

  let rows: db.AttachmentRow[] = [];
  if (contactId) rows = db.getAttachmentsByContact(contactId);
  else if (dealId) rows = db.getAttachmentsByDeal(dealId);
  else return { richBlocks: [], rawData: { error: "Specify a contact or deal to get attachments for" } };

  if (rows.length === 0) {
    return { richBlocks: [], rawData: { count: 0, message: "No files attached" } };
  }

  const listData: AttachmentListData = {
    attachments: rows.map(r => ({
      id: r.id,
      filename: r.originalName,
      url: r.url,
      size: r.size,
      mimeType: r.mimeType,
      contactName: contactName || undefined,
      dealName: dealName || undefined,
      uploadedAt: r.uploadedAt,
    })),
  };

  return {
    richBlocks: [{ type: "attachment-list", data: listData }],
    rawData: { count: rows.length },
  };
}

// ===== TASK TOOLS =====

function execCreateTask(args: Record<string, unknown>): ToolResult {
  // Resolve contact by name if needed
  let contactId = args.contact_id as string | undefined;
  if (!contactId && args.contact_name) {
    const matches = db.searchContacts(String(args.contact_name));
    if (matches.length > 0) contactId = matches[0].id;
  }

  const task = db.insertTask({
    title: String(args.title),
    description: args.description ? String(args.description) : undefined,
    dueDate: String(args.due_date),
    dueTime: args.due_time ? String(args.due_time) : undefined,
    priority: args.priority ? String(args.priority) : undefined,
    contactId,
    dealId: args.deal_id ? String(args.deal_id) : undefined,
    reminderMinutes: args.reminder_minutes !== undefined ? Number(args.reminder_minutes) : (args.due_time ? 15 : undefined),
  });

  return {
    richBlocks: [{ type: "task-list", data: { tasks: [task], title: "Task Created" } }],
    rawData: { task },
  };
}

function execGetTasks(args: Record<string, unknown>): ToolResult {
  const overdue = db.getOverdueTasks();
  const today = db.getTasksDueToday();
  const upcoming = db.getUpcomingTasks(7);

  // Apply optional filters
  let filteredOverdue = overdue;
  let filteredToday = today;
  let filteredUpcoming = upcoming;

  if (args.contact_id) {
    const cid = String(args.contact_id);
    filteredOverdue = overdue.filter(t => t.contactId === cid);
    filteredToday = today.filter(t => t.contactId === cid);
    filteredUpcoming = upcoming.filter(t => t.contactId === cid);
  }
  if (args.deal_id) {
    const did = String(args.deal_id);
    filteredOverdue = filteredOverdue.filter(t => t.dealId === did);
    filteredToday = filteredToday.filter(t => t.dealId === did);
    filteredUpcoming = filteredUpcoming.filter(t => t.dealId === did);
  }

  const allTasks = [...filteredOverdue, ...filteredToday, ...filteredUpcoming];

  return {
    richBlocks: [{
      type: "task-list",
      data: {
        tasks: allTasks,
        overdueCount: filteredOverdue.length,
        dueTodayCount: filteredToday.length,
        upcomingCount: filteredUpcoming.length,
        title: "Your Tasks",
      },
    }],
    rawData: {
      overdueCount: filteredOverdue.length,
      dueTodayCount: filteredToday.length,
      upcomingCount: filteredUpcoming.length,
      totalCount: allTasks.length,
      tasks: allTasks,
    },
  };
}

function execCompleteTask(args: Record<string, unknown>): ToolResult {
  const taskId = String(args.task_id);
  const task = db.completeTask(taskId);

  if (!task) {
    return { richBlocks: [], rawData: { error: "Task not found" } };
  }

  // Optionally log as activity
  if (args.log_activity && task.contactId) {
    db.insertActivity({
      type: "task",
      contactId: task.contactId,
      dealId: task.dealId || undefined,
      description: `Completed task: ${task.title}`,
    });
  }

  return {
    richBlocks: [{ type: "task-list", data: { tasks: [task], title: "Task Completed" } }],
    rawData: { task },
  };
}

// ===== SEARCH & DATA MANAGEMENT TOOLS =====

function execGlobalSearch(args: Record<string, unknown>): ToolResult {
  const query = String(args.query);
  const results = db.searchAll(query);

  // Build a data table for display
  const columns: TableColumn[] = [
    { key: "type", label: "Type", type: "badge" },
    { key: "title", label: "Result" },
    { key: "subtitle", label: "Details" },
  ];
  const rows = results.map(r => ({
    type: r.type,
    title: r.title,
    subtitle: r.subtitle,
    id: r.entityId || r.id,
    entityType: r.type === "contact" ? "contact" : r.type === "deal" ? "deal" : undefined,
  }));

  return {
    richBlocks: [{
      type: "data-table",
      data: { columns, rows, entityType: undefined, idField: "id" } as DataTableData,
    }],
    rawData: { query, resultCount: results.length, results },
  };
}

function execImportContacts(args: Record<string, unknown>): ToolResult {
  const fileId = String(args.file_id);
  const attachment = db.getAttachment(fileId);
  if (!attachment) {
    return { richBlocks: [], rawData: { error: "File not found. The user needs to upload a CSV file first." } };
  }

  // Read the file
  const filePath = path.join(UPLOAD_DIR, attachment.filename);
  if (!fs.existsSync(filePath)) {
    return { richBlocks: [], rawData: { error: "File not found on disk" } };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  if (lines.length < 2) {
    return { richBlocks: [], rawData: { error: "CSV file is empty or has no data rows" } };
  }

  const headers = lines[0].split(",").map((h: string) => h.trim().toLowerCase());
  const imported: { firstName: string; lastName: string; company: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v: string) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h: string, j: number) => { row[h] = values[j] || ""; });

    // Map common CSV column names
    const firstName = row.firstname || row["first name"] || row.first || row.name?.split(" ")[0] || "";
    const lastName = row.lastname || row["last name"] || row.last || row.name?.split(" ").slice(1).join(" ") || "";
    const company = row.company || row.organization || row.org || "";

    if (firstName && company) {
      db.insertContact({
        firstName,
        lastName,
        email: row.email || "",
        company,
        title: row.title || row.jobtitle || row["job title"] || "",
        phone: row.phone || row.telephone || "",
        status: "active",
        tags: row.tags ? row.tags.split(";").map((t: string) => t.trim()) : [],
      });
      imported.push({ firstName, lastName, company });
    }
  }

  return {
    richBlocks: [{
      type: "data-table",
      data: {
        columns: [
          { key: "firstName", label: "First Name" },
          { key: "lastName", label: "Last Name" },
          { key: "company", label: "Company" },
        ],
        rows: imported,
        entityType: "contact",
      } as DataTableData,
    }],
    rawData: { importedCount: imported.length, imported },
  };
}

function execExportContacts(args: Record<string, unknown>): ToolResult {
  let contacts: import("@/types/crm").Contact[];
  if (args.status) {
    contacts = db.searchContacts("").filter(c => c.status === args.status);
  } else {
    contacts = db.getAllContacts();
  }

  // Generate CSV content
  const headers = ["ID", "First Name", "Last Name", "Email", "Company", "Title", "Phone", "Status", "Tags"];
  const rows = contacts.map(c => [
    c.id, c.firstName, c.lastName, c.email, c.company, c.title, c.phone, c.status,
    (c.tags || []).join(";"),
  ]);
  // Prefix formula-like cells so spreadsheets treat them as text (CSV injection),
  // but leave phone numbers and plain numbers such as "+1 555-0100" untouched
  const csvCell = (v: unknown) => {
    const s = String(v ?? "");
    const safe = /^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = [headers.join(","), ...rows.map(r => r.map(csvCell).join(","))].join("\n");

  // Store as an attachment so it downloads through /api/files/[id]
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${id}.csv`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), csv);
  const attachment = db.insertAttachment({
    id,
    filename,
    originalName: `contacts-export-${new Date().toISOString().slice(0, 10)}.csv`,
    mimeType: "text/csv",
    size: Buffer.byteLength(csv),
    url: `/api/files/${id}`,
  });

  const listData: AttachmentListData = {
    attachments: [{
      id: attachment.id,
      filename: attachment.originalName,
      url: attachment.url,
      size: attachment.size,
      mimeType: attachment.mimeType,
      uploadedAt: attachment.uploadedAt,
    }],
  };

  return {
    richBlocks: [{ type: "attachment-list", data: listData }],
    rawData: {
      message: `Exported ${contacts.length} contacts to CSV. The download card is shown to the user.`,
      downloadUrl: attachment.url,
      contactCount: contacts.length,
    },
  };
}

function execBulkUpdate(args: Record<string, unknown>): ToolResult {
  const entityType = String(args.entity_type);
  const filter = args.filter as Record<string, unknown> || {};
  const updates = args.updates as Record<string, unknown> || {};
  const confirm = args.confirm === true;

  // Find matching entities
  let matches: Record<string, unknown>[] = [];
  if (entityType === "contact") {
    let contacts = db.getAllContacts() as unknown as Record<string, unknown>[];
    for (const [key, val] of Object.entries(filter)) {
      contacts = contacts.filter(c => String(c[key]).toLowerCase() === String(val).toLowerCase());
    }
    matches = contacts;
  } else if (entityType === "deal") {
    let deals = db.getAllDeals() as unknown as Record<string, unknown>[];
    for (const [key, val] of Object.entries(filter)) {
      deals = deals.filter(d => String(d[key]).toLowerCase() === String(val).toLowerCase());
    }
    matches = deals;
  } else if (entityType === "task") {
    let tasks = db.getTasks() as unknown as Record<string, unknown>[];
    for (const [key, val] of Object.entries(filter)) {
      tasks = tasks.filter(t => String(t[key]).toLowerCase() === String(val).toLowerCase());
    }
    matches = tasks;
  }

  if (!confirm) {
    // Preview mode
    return {
      richBlocks: [{
        type: "data-table",
        data: {
          columns: [
            { key: "id", label: "ID" },
            ...(entityType === "contact" ? [{ key: "firstName", label: "Name" }, { key: "company", label: "Company" }] : []),
            ...(entityType === "deal" ? [{ key: "name", label: "Deal" }, { key: "company", label: "Company" }] : []),
            ...(entityType === "task" ? [{ key: "title", label: "Task" }, { key: "status", label: "Status" }] : []),
          ],
          rows: matches.slice(0, 20),
        } as DataTableData,
      }],
      rawData: {
        matchCount: matches.length,
        preview: true,
        message: `Found ${matches.length} matching ${entityType}(s). Ask the user to confirm the bulk update.`,
      },
    };
  }

  // Execute the bulk update
  let updatedCount = 0;
  for (const entity of matches) {
    const id = String(entity.id);
    if (entityType === "contact") {
      db.updateContact(id, updates as Parameters<typeof db.updateContact>[1]);
      updatedCount++;
    } else if (entityType === "deal") {
      db.updateDeal(id, updates as Parameters<typeof db.updateDeal>[1]);
      updatedCount++;
    } else if (entityType === "task") {
      db.updateTask(id, updates as Parameters<typeof db.updateTask>[1]);
      updatedCount++;
    }
  }

  return {
    richBlocks: [],
    rawData: { updatedCount, message: `Successfully updated ${updatedCount} ${entityType}(s)` },
  };
}

// ===== REPORT TOOLS =====

function execPipelineReport(): ToolResult {
  const allDeals = db.getAllDeals();
  const active = allDeals.filter(d => d.stage !== "closed-won" && d.stage !== "closed-lost");
  const won = allDeals.filter(d => d.stage === "closed-won");
  const lost = allDeals.filter(d => d.stage === "closed-lost");

  // Pipeline by stage
  const stageData = PIPELINE_STAGES.map(stage => {
    const deals = allDeals.filter(d => d.stage === stage);
    return { label: STAGE_LABELS[stage], value: deals.reduce((s, d) => s + d.value, 0) };
  });

  // Win rate
  const totalClosed = won.length + lost.length;
  const winRate = totalClosed > 0 ? Math.round((won.length / totalClosed) * 100) : 0;

  // Average deal size
  const avgDealSize = active.length > 0 ? Math.round(active.reduce((s, d) => s + d.value, 0) / active.length) : 0;

  // Weighted pipeline
  const weightedValue = active.reduce((s, d) => s + d.value * (d.probability / 100), 0);

  const layout: DynamicUINode = {
    type: "stack",
    direction: "vertical",
    gap: "md",
    children: [
      { type: "heading", level: 2, text: "Pipeline Report" },
      {
        type: "grid",
        columns: 4,
        children: [
          { type: "metric", label: "Active Deals", value: String(active.length), subtext: formatCurrency(active.reduce((s, d) => s + d.value, 0)) },
          { type: "metric", label: "Weighted Pipeline", value: formatCurrency(weightedValue), trend: "up" },
          { type: "metric", label: "Win Rate", value: `${winRate}%`, subtext: `${won.length}W / ${lost.length}L` },
          { type: "metric", label: "Avg Deal Size", value: formatCurrency(avgDealSize) },
        ],
      },
      {
        type: "grid",
        columns: 2,
        children: [
          {
            type: "card",
            title: "Pipeline by Stage",
            children: [{
              type: "chart",
              chartType: "donut",
              data: stageData.filter(s => s.value > 0).map((s, i) => ({
                label: s.label,
                value: s.value,
                color: chartColor(i),
              })),
              showLegend: true,
              showValues: true,
            }],
          },
          {
            type: "card",
            title: "Deal Value by Stage",
            children: [{
              type: "bar-chart",
              bars: stageData.map((s, i) => ({
                label: s.label,
                value: s.value,
                color: chartColor(i),
              })),
            }],
          },
        ],
      },
      {
        type: "card",
        title: "Deals by Priority",
        children: [{
          type: "chart",
          chartType: "pie",
          data: ([
            { label: "High", value: active.filter(d => d.priority === "high").length, color: "red" as DynamicUIColor },
            { label: "Medium", value: active.filter(d => d.priority === "medium").length, color: "amber" as DynamicUIColor },
            { label: "Low", value: active.filter(d => d.priority === "low").length, color: "blue" as DynamicUIColor },
          ]).filter(d => d.value > 0),
          showLegend: true,
          showValues: true,
        }],
      },
    ],
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: { title: "Pipeline Report", layout } as DynamicUIData }],
    rawData: {
      activeDealCount: active.length,
      totalPipelineValue: active.reduce((s, d) => s + d.value, 0),
      weightedPipeline: weightedValue,
      winRate,
      avgDealSize,
      wonCount: won.length,
      lostCount: lost.length,
    },
  };
}

function execActivityReport(args: Record<string, unknown>): ToolResult {
  const days = Number(args.days) || 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const allActivities = db.getRecentActivities(500).filter(a => a.timestamp >= cutoff);

  // Group by type
  const byType: Record<string, number> = {};
  for (const a of allActivities) {
    byType[a.type] = (byType[a.type] || 0) + 1;
  }

  // Most active contacts (by activity count)
  const byContact: Record<string, { count: number; name: string }> = {};
  for (const a of allActivities) {
    if (!byContact[a.contactId]) {
      const contact = db.getContact(a.contactId);
      byContact[a.contactId] = { count: 0, name: contact ? `${contact.firstName} ${contact.lastName}` : a.contactId };
    }
    byContact[a.contactId].count++;
  }
  const topContacts = Object.values(byContact).sort((a, b) => b.count - a.count).slice(0, 5);

  const layout: DynamicUINode = {
    type: "stack",
    direction: "vertical",
    gap: "md",
    children: [
      { type: "heading", level: 2, text: `Activity Report (Last ${days} Days)` },
      {
        type: "grid",
        columns: 3,
        children: [
          { type: "metric", label: "Total Activities", value: String(allActivities.length) },
          { type: "metric", label: "Calls", value: String(byType.call || 0) },
          { type: "metric", label: "Emails", value: String(byType.email || 0) },
        ],
      },
      {
        type: "grid",
        columns: 2,
        children: [
          {
            type: "card",
            title: "Activities by Type",
            children: [{
              type: "chart",
              chartType: "pie",
              data: Object.entries(byType).map(([type, count], i) => ({
                label: type.replace("-", " "),
                value: count,
                color: chartColor(i),
              })),
              showLegend: true,
              showValues: true,
            }],
          },
          {
            type: "card",
            title: "Most Active Contacts",
            children: [{
              type: "bar-chart",
              bars: topContacts.map((c, i) => ({
                label: c.name,
                value: c.count,
                color: chartColor(i),
              })),
            }],
          },
        ],
      },
    ],
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: { title: "Activity Report", layout } as DynamicUIData }],
    rawData: {
      totalActivities: allActivities.length,
      byType,
      topContacts,
      period: `${days} days`,
    },
  };
}

// ===== Office 365 Tool Executors =====

function execSendOutlookEmail(args: Record<string, unknown>): ToolResult {
  if (!office365.isOffice365Connected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Office 365 not connected. Please connect in Settings first." },
    };
  }

  let contactId = args.contact_id ? String(args.contact_id) : undefined;
  let contactEmail = "";
  let contactName = "";

  if (contactId) {
    const contact = db.getContact(contactId);
    if (contact) {
      contactEmail = contact.email;
      contactName = `${contact.firstName} ${contact.lastName}`;
    }
  } else if (args.contact_name) {
    const matches = db.searchContacts(String(args.contact_name));
    if (matches.length > 0) {
      contactId = matches[0].id;
      contactEmail = matches[0].email;
      contactName = `${matches[0].firstName} ${matches[0].lastName}`;
    }
  }

  if (!contactEmail && !args.contact_name) {
    return { richBlocks: [], rawData: { error: "No contact email found. Please specify a contact." } };
  }

  const composeData: EmailComposeData = {
    to: contactEmail,
    toName: contactName || undefined,
    contactId: contactId || undefined,
    subject: String(args.subject || ""),
    bodyHtml: String(args.body_html || ""),
    bodyText: String(args.body_text || args.body_html || "").replace(/<[^>]*>/g, ""),
    inReplyTo: args.in_reply_to ? String(args.in_reply_to) : undefined,
    mode: args.in_reply_to ? "reply" : "compose",
  };

  return {
    richBlocks: [{ type: "email-compose", data: composeData }],
    rawData: { composePrepared: true, to: contactEmail, subject: composeData.subject, provider: "outlook" },
  };
}

function execGetOutlookInbox(args: Record<string, unknown>): ToolResult {
  if (!office365.isOffice365Connected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Office 365 not connected. Please connect in Settings first." },
    };
  }

  let contactId = args.contact_id ? String(args.contact_id) : undefined;
  if (!contactId && args.contact_name) {
    const matches = db.searchContacts(String(args.contact_name));
    if (matches.length > 0) contactId = matches[0].id;
  }

  const limit = Number(args.limit) || 15;
  const result = db.getOutlookEmails({ contactId, unreadOnly: Boolean(args.unread_only), page: 1, pageSize: limit });

  const emailListData: EmailListData = {
    emails: result.emails.map((e) => ({
      id: e.id,
      gmailMessageId: e.outlookMessageId || e.gmailMessageId,
      gmailThreadId: e.outlookConversationId || e.gmailThreadId,
      fromAddress: e.fromAddress,
      toAddress: e.toAddress,
      subject: e.subject,
      bodyPreview: (e.bodyText || e.bodyHtml.replace(/<[^>]*>/g, "")).slice(0, 120),
      isRead: Boolean(e.isRead),
      sentAt: e.sentAt,
      contactName: contactId ? (() => { const c = db.getContact(contactId!); return c ? `${c.firstName} ${c.lastName}` : undefined; })() : undefined,
      direction: e.direction,
    })),
    totalCount: result.totalCount,
    unreadCount: result.unreadCount,
    page: 1,
    pageSize: limit,
    hasMore: limit < result.totalCount,
  };

  return {
    richBlocks: [{ type: "email-list", data: emailListData }],
    rawData: { count: result.emails.length, totalCount: result.totalCount, unreadCount: result.unreadCount },
  };
}

function execGetOutlookThread(args: Record<string, unknown>): ToolResult {
  if (!office365.isOffice365Connected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Office 365 not connected. Please connect in Settings first." },
    };
  }

  const conversationId = String(args.conversation_id);
  const emails = db.getOutlookEmailThread(conversationId);

  if (emails.length === 0) {
    return { richBlocks: [], rawData: { error: "Email thread not found" } };
  }

  const latest = emails[emails.length - 1];
  const thread = emails.slice(0, -1);

  const resolveContactName = (emailAddr: string) => {
    const addr = emailAddr.match(/<([^>]+)>/)?.[1] || emailAddr.trim();
    const contacts = db.getAllContacts();
    const contact = contacts.find(c => c.email.toLowerCase() === addr.toLowerCase());
    return contact ? `${contact.firstName} ${contact.lastName}` : undefined;
  };

  const emailDetailData: EmailDetailData = {
    id: latest.id,
    gmailMessageId: latest.outlookMessageId || latest.gmailMessageId,
    gmailThreadId: latest.outlookConversationId || latest.gmailThreadId,
    fromAddress: latest.fromAddress,
    toAddress: latest.toAddress,
    ccAddress: latest.ccAddress || undefined,
    subject: latest.subject,
    bodyHtml: latest.bodyHtml,
    sentAt: latest.sentAt,
    contactName: resolveContactName(latest.direction === "inbound" ? latest.fromAddress : latest.toAddress),
    contactId: latest.contactId || undefined,
    direction: latest.direction,
    thread: thread.length > 0 ? thread.map(e => ({
      id: e.id,
      gmailMessageId: e.outlookMessageId || e.gmailMessageId,
      gmailThreadId: e.outlookConversationId || e.gmailThreadId,
      fromAddress: e.fromAddress,
      toAddress: e.toAddress,
      ccAddress: e.ccAddress || undefined,
      subject: e.subject,
      bodyHtml: e.bodyHtml,
      sentAt: e.sentAt,
      contactName: resolveContactName(e.direction === "inbound" ? e.fromAddress : e.toAddress),
      contactId: e.contactId || undefined,
      direction: e.direction,
    })) : undefined,
  };

  return {
    richBlocks: [{ type: "email-detail", data: emailDetailData }],
    rawData: { emailCount: emails.length, conversationId },
  };
}

function execGetCalendarEvents(args: Record<string, unknown>): ToolResult {
  if (!office365.isOffice365Connected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Office 365 not connected. Please connect in Settings first." },
    };
  }

  const events = db.getCalendarEvents({
    startDate: args.start_date ? String(args.start_date) : new Date().toISOString(),
    endDate: args.end_date ? String(args.end_date) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const calendarData: CalendarEventsData = {
    events: events.map(e => {
      const attendees = JSON.parse(e.attendees || "[]") as { email: string; name: string; response: string }[];
      let contactName: string | undefined;
      if (e.contactId) {
        const contact = db.getContact(e.contactId);
        if (contact) contactName = `${contact.firstName} ${contact.lastName}`;
      }
      return {
        id: e.id,
        subject: e.subject,
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location,
        isAllDay: Boolean(e.isAllDay),
        organizerName: e.organizerName,
        attendees,
        contactId: e.contactId || undefined,
        contactName,
        webLink: e.webLink,
      } satisfies CalendarEventItem;
    }),
    dateRange: `${args.start_date || "today"} to ${args.end_date || "next 14 days"}`,
  };

  return {
    richBlocks: [{ type: "calendar-events", data: calendarData }],
    rawData: { eventCount: events.length },
  };
}

function execCreateCalendarEvent(args: Record<string, unknown>): ToolResult {
  if (!office365.isOffice365Connected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Office 365 not connected. Please connect in Settings first." },
    };
  }

  const formData: InlineFormData = {
    entityType: "activity",
    title: "Create Calendar Event",
    mode: "create",
    fields: [
      { key: "subject", label: "Subject", type: "text", value: String(args.subject || ""), required: true },
      { key: "start_time", label: "Start Time", type: "text", value: String(args.start_time || ""), required: true },
      { key: "end_time", label: "End Time", type: "text", value: String(args.end_time || ""), required: true },
      { key: "location", label: "Location", type: "text", value: String(args.location || "") },
      { key: "attendees", label: "Attendees (emails)", type: "text", value: ((args.attendee_emails as string[]) || []).join(", ") },
    ],
  };

  return {
    richBlocks: [{ type: "inline-form", data: formData }],
    rawData: { eventPrepared: true, subject: args.subject, provider: "outlook" },
  };
}

function execImportOutlookContacts(): ToolResult {
  if (!office365.isOffice365Connected()) {
    return {
      richBlocks: [{ type: "integration-status", data: getIntegrationStatus() }],
      rawData: { error: "Office 365 not connected. Please connect in Settings first." },
    };
  }

  const tableData: DataTableData = {
    columns: [
      { key: "firstName", label: "First Name" },
      { key: "lastName", label: "Last Name" },
      { key: "email", label: "Email" },
      { key: "company", label: "Company" },
      { key: "status", label: "Import Status", type: "status" },
    ],
    rows: [],
    entityType: "contact",
  };

  return {
    richBlocks: [{ type: "data-table", data: tableData }],
    rawData: { importReady: true, message: "Fetching contacts from Office 365..." },
  };
}

// ===== FOLLOW-UP TOOL EXECUTORS =====

function execGetStaleDeals(args: Record<string, unknown>): ToolResult {
  const minDays = args.min_days ? Number(args.min_days) : undefined;
  const staleDeals = followUps.getStaleDealsList({ minDays });

  if (staleDeals.length === 0) {
    return {
      richBlocks: [],
      rawData: { count: 0, message: "No stale deals found" },
    };
  }

  const layout: DynamicUINode = {
    type: "stack",
    direction: "vertical",
    gap: "md",
    children: [
      { type: "heading", level: 2 as const, text: `${staleDeals.length} Stale Deal${staleDeals.length > 1 ? "s" : ""} Need Attention` },
      {
        type: "table",
        headers: ["Deal", "Contact", "Stage", "Value", "Days Inactive", "Severity"],
        rows: staleDeals.map(sd => [
          sd.deal.name,
          sd.contactName,
          sd.deal.stage,
          `$${sd.deal.value.toLocaleString()}`,
          String(sd.daysSinceActivity),
          sd.severity,
        ]),
      },
      {
        type: "callout",
        variant: "warning",
        title: "Recommendations",
        content: staleDeals.slice(0, 3).map(sd =>
          `${sd.deal.name} (${sd.contactName}) — ${sd.daysSinceActivity} days inactive. ${sd.severity === "at-risk" ? "Consider moving to closed-lost or re-engage urgently." : "Send a follow-up email or schedule a call."}`
        ).join("\n\n"),
      },
    ],
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: { title: "Stale Deals", layout } as DynamicUIData }],
    rawData: { count: staleDeals.length, staleDeals },
  };
}

function execGetFollowUpSuggestions(args: Record<string, unknown>): ToolResult {
  const days = args.days ? Number(args.days) : undefined;
  const limit = args.limit ? Number(args.limit) : undefined;
  const suggestions = followUps.getFollowUpSuggestions({ days, limit });

  if (suggestions.length === 0) {
    return {
      richBlocks: [],
      rawData: { count: 0, message: "No follow-up suggestions at this time" },
    };
  }

  const priorityColor = (p: string): DynamicUIColor =>
    p === "high" ? "red" : p === "medium" ? "amber" : "blue";

  const cards: DynamicUINode[] = suggestions.map(s => ({
    type: "card" as const,
    title: s.contactName,
    children: [
      { type: "text" as const, content: s.reason },
      { type: "text" as const, content: `Suggested Action: ${s.suggestedAction}` },
      {
        type: "badge-group" as const,
        badges: [
          { text: `${s.priority} priority`, color: priorityColor(s.priority) },
          ...s.relatedDeals.slice(0, 2).map(d => ({ text: d.name, color: "indigo" as DynamicUIColor })),
        ],
      },
    ],
  }));

  const layout: DynamicUINode = {
    type: "stack",
    direction: "vertical",
    gap: "md",
    children: [
      { type: "heading", level: 2 as const, text: `${suggestions.length} Follow-up${suggestions.length > 1 ? "s" : ""} Recommended` },
      ...cards,
    ],
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: { title: "Follow-up Suggestions", layout } as DynamicUIData }],
    rawData: { count: suggestions.length, suggestions },
  };
}

function execGetNextActions(args: Record<string, unknown>): ToolResult {
  const dealId = args.deal_id ? String(args.deal_id) : undefined;
  const actions = followUps.getNextActions({ dealId });

  if (actions.length === 0) {
    return {
      richBlocks: [],
      rawData: { count: 0, message: "No next actions found" },
    };
  }

  const priorityColor = (p: string): DynamicUIColor =>
    p === "high" ? "red" : p === "medium" ? "amber" : "blue";

  const stageColor = (s: string): DynamicUIColor => {
    const map: Record<string, DynamicUIColor> = {
      lead: "blue",
      qualified: "indigo",
      proposal: "violet",
      negotiation: "amber",
    };
    return map[s] || "blue";
  };

  const cards: DynamicUINode[] = actions.map(a => ({
    type: "card" as const,
    title: a.dealName,
    children: [
      {
        type: "badge-group" as const,
        badges: [
          { text: a.stage, color: stageColor(a.stage) },
          { text: `${a.priority} priority`, color: priorityColor(a.priority) },
        ],
      },
      { type: "text" as const, content: `Action: ${a.suggestedAction}` },
      { type: "text" as const, content: a.reasoning, muted: true },
    ],
  }));

  const layout: DynamicUINode = {
    type: "stack",
    direction: "vertical",
    gap: "md",
    children: [
      { type: "heading", level: 2 as const, text: "Next Actions" },
      ...cards,
    ],
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: { title: "Next Actions", layout } as DynamicUIData }],
    rawData: { count: actions.length, actions },
  };
}

function execCreateEmailTemplate(args: Record<string, unknown>): ToolResult {
  const name = String(args.name || "");
  const subject = String(args.subject || "");
  const bodyHtml = String(args.body_html || args.body || "");
  const bodyText = String(args.body_text || bodyHtml.replace(/<[^>]*>/g, ""));

  // Extract merge fields from content using matchAll
  const mergeFieldRegex = /\{\{([^}]+)\}\}/g;
  const mergeFieldsSet = new Set<string>();
  for (const content of [subject, bodyHtml, bodyText]) {
    for (const match of content.matchAll(mergeFieldRegex)) {
      mergeFieldsSet.add(match[0]);
    }
  }
  const mergeFields = Array.from(mergeFieldsSet);

  const template = db.insertEmailTemplate({ name, subject, bodyHtml, bodyText, mergeFields });

  return {
    richBlocks: [],
    rawData: {
      created: true,
      templateId: template.id,
      name: template.name,
      mergeFields,
      message: `Template "${name}" saved with ${mergeFields.length} merge field${mergeFields.length !== 1 ? "s" : ""}`,
    },
  };
}

function execListEmailTemplates(): ToolResult {
  const templates = db.getAllEmailTemplates();

  if (templates.length === 0) {
    return {
      richBlocks: [],
      rawData: { count: 0, message: "No email templates saved yet. Ask me to create one!" },
    };
  }

  const tableData: DataTableData = {
    columns: [
      { key: "name", label: "Name", sortable: true },
      { key: "subject", label: "Subject" },
      { key: "mergeFieldCount", label: "Merge Fields" },
      { key: "updatedAt", label: "Last Updated", sortable: true, type: "date" },
    ],
    rows: templates.map(t => {
      const fields = JSON.parse(t.mergeFields || "[]") as string[];
      return {
        id: t.id,
        name: t.name,
        subject: t.subject,
        mergeFieldCount: String(fields.length),
        updatedAt: t.updatedAt,
      };
    }),
  };

  return {
    richBlocks: [{ type: "data-table", data: tableData }],
    rawData: { count: templates.length, templates },
  };
}

function execApplyEmailTemplate(args: Record<string, unknown>): ToolResult {
  // Resolve template
  let template = args.template_id ? db.getEmailTemplate(String(args.template_id)) : undefined;
  if (!template && args.template_name) {
    const all = db.getAllEmailTemplates();
    template = all.find(t => t.name.toLowerCase().includes(String(args.template_name).toLowerCase()));
  }
  if (!template) {
    return { richBlocks: [], rawData: { error: "Email template not found. Use list_email_templates to see available templates." } };
  }

  // Resolve contact
  let contactId = args.contact_id ? String(args.contact_id) : undefined;
  let contact;
  if (contactId) {
    contact = db.getContact(contactId);
  } else if (args.contact_name) {
    const matches = db.searchContacts(String(args.contact_name));
    if (matches.length > 0) {
      contact = matches[0];
      contactId = contact.id;
    }
  }
  if (!contact) {
    return { richBlocks: [], rawData: { error: "Contact not found. Please specify a valid contact." } };
  }

  // Optionally resolve deal
  let deal;
  if (args.deal_id) {
    deal = db.getDeal(String(args.deal_id));
  } else if (args.deal_name) {
    const deals = db.getDealsByContact(contact.id);
    deal = deals.find(d => d.name.toLowerCase().includes(String(args.deal_name).toLowerCase())) || deals[0];
  }

  const interpolated = followUps.interpolateTemplate(template, {
    contactFirstName: contact.firstName,
    contactLastName: contact.lastName,
    contactEmail: contact.email,
    contactCompany: contact.company,
    dealName: deal?.name,
    dealValue: deal ? `$${deal.value.toLocaleString()}` : undefined,
    dealStage: deal?.stage,
  });

  const composeData: EmailComposeData = {
    to: contact.email,
    toName: `${contact.firstName} ${contact.lastName}`,
    contactId,
    subject: interpolated.subject,
    bodyHtml: interpolated.bodyHtml,
    bodyText: interpolated.bodyText,
    mode: "compose",
  };

  return {
    richBlocks: [{ type: "email-compose", data: composeData }],
    rawData: { templateApplied: true, templateName: template.name, contactName: `${contact.firstName} ${contact.lastName}` },
  };
}

function execScheduleMessage(args: Record<string, unknown>): ToolResult {
  // Resolve contact
  let contactId = args.contact_id ? String(args.contact_id) : undefined;
  let contact;
  if (contactId) {
    contact = db.getContact(contactId);
  } else if (args.contact_name) {
    const matches = db.searchContacts(String(args.contact_name));
    if (matches.length > 0) {
      contact = matches[0];
      contactId = contact.id;
    }
  }

  const recipientAddress = args.recipient_address
    ? String(args.recipient_address)
    : contact?.email || "";

  if (!recipientAddress) {
    return { richBlocks: [], rawData: { error: "Could not determine recipient address. Please specify a contact or recipient." } };
  }

  const type = (args.type === "sms" ? "sms" : "email") as "email" | "sms";
  const provider = (args.provider === "outlook" ? "outlook" : args.provider === "twilio" ? "twilio" : "gmail") as "gmail" | "outlook" | "twilio";

  const scheduled = db.insertScheduledMessage({
    type,
    provider,
    contactId,
    recipientAddress,
    subject: args.subject ? String(args.subject) : undefined,
    bodyHtml: args.body_html ? String(args.body_html) : undefined,
    bodyText: args.body_text ? String(args.body_text) : undefined,
    scheduledAt: String(args.scheduled_at),
  });

  const contactName = contact ? `${contact.firstName} ${contact.lastName}` : recipientAddress;
  const scheduledDate = new Date(scheduled.scheduledAt).toLocaleString();

  return {
    richBlocks: [],
    rawData: {
      scheduled: true,
      scheduledMessageId: scheduled.id,
      message: `${type === "sms" ? "SMS" : "Email"} to ${contactName} scheduled for ${scheduledDate}`,
      scheduledAt: scheduled.scheduledAt,
    },
  };
}

function execGetMorningBriefing(): ToolResult {
  const briefing = followUps.getMorningBriefing();

  const staleDealsSection: DynamicUINode[] = briefing.staleDeals.length > 0 ? [
    { type: "heading", level: 3 as const, text: `Stale Deals (${briefing.staleDeals.length})` },
    {
      type: "table",
      headers: ["Deal", "Contact", "Days Inactive", "Severity"],
      rows: briefing.staleDeals.slice(0, 5).map(sd => [
        sd.deal.name,
        sd.contactName,
        String(sd.daysSinceActivity),
        sd.severity,
      ]),
    },
  ] : [];

  const followUpsSection: DynamicUINode[] = briefing.followUps.length > 0 ? [
    { type: "heading", level: 3 as const, text: `Follow-ups Needed (${briefing.followUps.length})` },
    {
      type: "list",
      items: briefing.followUps.slice(0, 5).map(f => ({
        label: f.contactName,
        value: `${f.suggestedAction} (${f.daysSinceContact} days)`,
      })),
    },
  ] : [];

  const calendarSection: DynamicUINode[] = briefing.todayCalendarEvents.length > 0 ? [
    { type: "heading", level: 3 as const, text: `Today's Calendar (${briefing.todayCalendarEvents.length})` },
    {
      type: "list",
      items: briefing.todayCalendarEvents.map(e => {
        const time = new Date(e.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return { label: time, value: `${e.subject}${e.location ? ` @ ${e.location}` : ""}` };
      }),
    },
  ] : [];

  const tasksTotal = briefing.overdueTasks.length + briefing.todayTasks.length;
  const tasksSection: DynamicUINode[] = tasksTotal > 0 ? [
    { type: "heading", level: 3 as const, text: `Tasks (${briefing.overdueTasks.length} overdue, ${briefing.todayTasks.length} due today)` },
    {
      type: "list",
      items: [
        ...briefing.overdueTasks.slice(0, 3).map(t => ({ label: "Overdue", value: t.title })),
        ...briefing.todayTasks.slice(0, 3).map(t => ({ label: "Due today", value: t.title })),
      ],
    },
  ] : [];

  const layout: DynamicUINode = {
    type: "stack",
    direction: "vertical",
    gap: "md",
    children: [
      { type: "heading", level: 1 as const, text: "Morning Briefing" },
      { type: "text", content: briefing.greeting },
      {
        type: "grid",
        columns: 4 as const,
        children: [
          { type: "metric", label: "Active Deals", value: String(briefing.stats.activeDeals), subtext: `$${Math.round(briefing.stats.pipelineValue).toLocaleString()} pipeline` },
          { type: "metric", label: "Closing This Month", value: String(briefing.stats.closingThisMonth) },
          { type: "metric", label: "Stale Deals", value: String(briefing.staleDeals.length), trend: briefing.staleDeals.length > 0 ? "down" : "neutral" },
          { type: "metric", label: "Pending Tasks", value: String(briefing.stats.pendingTasks) },
        ],
      },
      { type: "divider" },
      ...staleDealsSection,
      ...followUpsSection,
      ...calendarSection,
      ...tasksSection,
    ],
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: { title: "Morning Briefing", layout } as DynamicUIData }],
    rawData: {
      greeting: briefing.greeting,
      staleDealsCount: briefing.staleDeals.length,
      followUpsCount: briefing.followUps.length,
      overdueTasks: briefing.overdueTasks.length,
      todayTasks: briefing.todayTasks.length,
      calendarEvents: briefing.todayCalendarEvents.length,
    },
  };
}

function execGetLeadScores(args: Record<string, unknown>): ToolResult {
  const limit = Number(args.limit) || 20;
  const scores = intelligence.getLeadScores({ limit });

  if (scores.length === 0) {
    return { richBlocks: [], rawData: { count: 0, message: "No active contacts to score." } };
  }

  const uiData: DynamicUIData = {
    title: `Lead Scores (${scores.length} contacts)`,
    layout: {
      type: "stack",
      direction: "vertical",
      gap: "md",
      children: [
        {
          type: "table",
          headers: ["Contact", "Company", "Score", "Tier", "Top Signal"],
          rows: scores.map(s => [
            s.contactName,
            s.company,
            `${s.score}/100`,
            s.tier,
            s.signals[0]?.label || "—",
          ]),
        },
      ],
    },
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: uiData }],
    rawData: { count: scores.length, scores: scores.map(s => ({ contactId: s.contactId, name: s.contactName, score: s.score, tier: s.tier })) },
  };
}

function execGetDealHealth(args: Record<string, unknown>): ToolResult {
  const dealId = args.deal_id ? String(args.deal_id) : undefined;
  const healthList = intelligence.getDealHealthList({ dealId });

  if (healthList.length === 0) {
    return { richBlocks: [], rawData: { count: 0, message: "No active deals to evaluate." } };
  }

  const uiData: DynamicUIData = {
    title: dealId ? "Deal Health" : `Deal Health (${healthList.length} deals)`,
    layout: {
      type: "stack",
      direction: "vertical",
      gap: "md",
      children: healthList.map(dh => ({
        type: "card" as const,
        title: `${dh.dealName} — $${dh.value.toLocaleString()}`,
        children: [
          {
            type: "badge-group" as const,
            badges: [
              { text: `${dh.health} (${dh.healthScore}/100)`, color: dh.health === "green" ? "emerald" as const : dh.health === "yellow" ? "amber" as const : "red" as const },
              { text: dh.stage, color: "indigo" as const },
            ],
          },
          {
            type: "list" as const,
            items: dh.factors.map(f => ({
              label: f.label,
              value: `${f.status === "good" ? "OK" : f.status === "warning" ? "WARN" : "BAD"} — ${f.detail}`,
            })),
          },
        ],
      }) as DynamicUINode),
    },
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: uiData }],
    rawData: { count: healthList.length, deals: healthList.map(d => ({ dealId: d.dealId, name: d.dealName, health: d.health, score: d.healthScore })) },
  };
}

function execGetRelationshipMap(args: Record<string, unknown>): ToolResult {
  const limit = Number(args.limit) || 20;
  const relationships = intelligence.getRelationshipMap({ limit });

  if (relationships.length === 0) {
    return { richBlocks: [], rawData: { count: 0, message: "No active contacts to map." } };
  }

  const uiData: DynamicUIData = {
    title: `Relationship Map (${relationships.length} contacts)`,
    layout: {
      type: "stack",
      direction: "vertical",
      gap: "md",
      children: [
        {
          type: "table",
          headers: ["Contact", "Company", "Score", "Strength", "Key Signal"],
          rows: relationships.map(r => [
            r.contactName,
            r.company,
            `${r.strengthScore}/100`,
            r.strength,
            r.signals[0]?.value || "—",
          ]),
        },
      ],
    },
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: uiData }],
    rawData: { count: relationships.length, relationships: relationships.map(r => ({ contactId: r.contactId, name: r.contactName, strength: r.strength, score: r.strengthScore })) },
  };
}

function execGetSalesInsights(): ToolResult {
  const insights = intelligence.getSalesInsights();

  if (insights.length === 0) {
    return { richBlocks: [], rawData: { count: 0, message: "Not enough data to generate insights yet." } };
  }

  const uiData: DynamicUIData = {
    title: "Sales Insights",
    layout: {
      type: "stack",
      direction: "vertical",
      gap: "md",
      children: insights.map(i => ({
        type: "callout" as const,
        variant: i.type === "warning" ? "warning" as const : i.type === "opportunity" ? "success" as const : "info" as const,
        title: i.title,
        content: `${i.description}\n\n_${i.evidence}_`,
      }) as DynamicUINode),
    },
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: uiData }],
    rawData: { count: insights.length, insights: insights.map(i => ({ type: i.type, title: i.title })) },
  };
}

function execGetPipelineTrends(args: Record<string, unknown>): ToolResult {
  const days = args.days ? Number(args.days) : 30;
  const trends = analytics.getPipelineTrends({ days });

  if (trends.length === 0) {
    return { richBlocks: [], rawData: { count: 0, message: "No pipeline trend data available." } };
  }

  const uiData: DynamicUIData = {
    title: `Pipeline Trends (Last ${days} Days)`,
    layout: {
      type: "stack",
      direction: "vertical",
      gap: "md",
      children: [
        {
          type: "stat-row" as const,
          stats: [
            {
              label: "Latest Pipeline Value",
              value: formatCurrency(trends[trends.length - 1].totalValue),
              trend: trends.length > 1 && trends[trends.length - 1].totalValue >= trends[0].totalValue ? "up" as const : "down" as const,
              change: trends.length > 1
                ? `${trends[0].totalValue > 0 ? Math.round(((trends[trends.length - 1].totalValue - trends[0].totalValue) / trends[0].totalValue) * 100) : 0}%`
                : undefined,
            },
            {
              label: "Latest Weighted Value",
              value: formatCurrency(trends[trends.length - 1].weightedValue),
              trend: trends.length > 1 && trends[trends.length - 1].weightedValue >= trends[0].weightedValue ? "up" as const : "down" as const,
            },
            {
              label: "Active Deals",
              value: String(trends[trends.length - 1].dealCount),
            },
            {
              label: "Data Points",
              value: String(trends.length),
            },
          ],
        } as DynamicUINode,
        {
          type: "chart" as const,
          chartType: "area" as const,
          title: "Pipeline Value Over Time",
          showValues: false,
          showLegend: false,
          data: trends.map((point, idx) => ({
            label: point.date,
            value: point.weightedValue,
            color: chartColor(idx),
          })),
        } as DynamicUINode,
      ],
    },
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: uiData }],
    rawData: { days, pointCount: trends.length, trends },
  };
}

function execGetRevenueForecast(args: Record<string, unknown>): ToolResult {
  const months = args.months ? Number(args.months) : 6;
  const forecast = analytics.getRevenueForecast({ months });

  const uiData: DynamicUIData = {
    title: `Revenue Forecast (Next ${months} Months)`,
    layout: {
      type: "stack",
      direction: "vertical",
      gap: "md",
      children: [
        {
          type: "chart" as const,
          chartType: "vertical-bar" as const,
          title: "Forecast vs Closed Won by Month",
          showValues: true,
          showLegend: false,
          data: forecast.map((f, idx) => ({
            label: f.period,
            value: f.forecastValue,
            color: chartColor(idx),
          })),
        } as DynamicUINode,
        {
          type: "table" as const,
          headers: ["Period", "Forecast Value", "Closed Won", "Deal Count"],
          rows: forecast.map(f => [
            f.period,
            formatCurrency(f.forecastValue),
            formatCurrency(f.closedWonValue),
            String(f.dealCount),
          ]),
        } as DynamicUINode,
      ],
    },
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: uiData }],
    rawData: { months, forecast },
  };
}

function execGetSalesVelocity(): ToolResult {
  const velocity = analytics.getSalesVelocity();

  const stageEntries = Object.entries(velocity.avgDaysPerStage);
  const conversionEntries = Object.entries(velocity.conversionRates);

  const uiData: DynamicUIData = {
    title: "Sales Velocity",
    layout: {
      type: "stack",
      direction: "vertical",
      gap: "md",
      children: [
        {
          type: "stat-row" as const,
          stats: [
            {
              label: "Avg Cycle Time",
              value: `${velocity.avgCycleTime} days`,
            },
            {
              label: "Revenue Velocity",
              value: formatCurrency(velocity.velocity),
              trend: velocity.velocity > 0 ? "up" as const : "neutral" as const,
            },
          ],
        } as DynamicUINode,
        ...(stageEntries.length > 0 ? [{
          type: "bar-chart" as const,
          title: "Avg Days per Stage",
          maxValue: Math.max(...stageEntries.map(([, v]) => v)),
          bars: stageEntries.map(([stage, days], idx) => ({
            label: stage,
            value: days,
            color: chartColor(idx),
          })),
        } as DynamicUINode] : []),
        ...(conversionEntries.length > 0 ? [{
          type: "table" as const,
          headers: ["Stage Transition", "Conversion Rate"],
          rows: conversionEntries.map(([key, rate]) => [key.replace(/_/g, " → "), `${rate}%`]),
        } as DynamicUINode] : []),
      ],
    },
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: uiData }],
    rawData: velocity,
  };
}

function execGetWinLossAnalysis(args: Record<string, unknown>): ToolResult {
  const startDate = args.start_date ? String(args.start_date) : undefined;
  const endDate = args.end_date ? String(args.end_date) : undefined;
  const analysis = analytics.getWinLossAnalysis({ startDate, endDate });

  const uiData: DynamicUIData = {
    title: "Win / Loss Analysis",
    layout: {
      type: "stack",
      direction: "vertical",
      gap: "md",
      children: [
        {
          type: "stat-row" as const,
          stats: [
            { label: "Win Rate", value: `${analysis.winRate}%`, trend: analysis.winRate >= 50 ? "up" as const : "down" as const },
            { label: "Deals Won", value: String(analysis.totalWon) },
            { label: "Deals Lost", value: String(analysis.totalLost) },
            { label: "Avg Won Value", value: formatCurrency(analysis.avgWonValue) },
            { label: "Avg Won Cycle", value: `${analysis.avgWonCycleTime}d` },
            { label: "Avg Lost Cycle", value: `${analysis.avgLostCycleTime}d` },
          ],
        } as DynamicUINode,
        {
          type: "chart" as const,
          chartType: "donut" as const,
          title: "Win vs Loss",
          showValues: true,
          showLegend: true,
          data: [
            { label: "Won", value: analysis.totalWon, color: "emerald" as const },
            { label: "Lost", value: analysis.totalLost, color: "red" as const },
          ],
        } as DynamicUINode,
        ...(analysis.byValueRange.length > 0 ? [{
          type: "table" as const,
          headers: ["Value Range", "Won", "Lost", "Win Rate"],
          rows: analysis.byValueRange.map(r => [r.range, String(r.won), String(r.lost), `${r.winRate}%`]),
        } as DynamicUINode] : []),
      ],
    },
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: uiData }],
    rawData: analysis,
  };
}

function execGetActivityTrends(args: Record<string, unknown>): ToolResult {
  const days = args.days ? Number(args.days) : 90;
  const trends = analytics.getActivityTrends({ days });

  const typeEntries = Object.entries(trends.byType);

  const uiData: DynamicUIData = {
    title: `Activity Trends (Last ${days} Days)`,
    layout: {
      type: "stack",
      direction: "vertical",
      gap: "md",
      children: [
        {
          type: "stat-row" as const,
          stats: [
            { label: "Total Activities", value: String(trends.totalActivities) },
            { label: "Activity Types", value: String(typeEntries.length) },
            { label: "Active Weeks", value: String(trends.byWeek.length) },
            { label: "Top Contacts Tracked", value: String(trends.mostActiveContacts.length) },
          ],
        } as DynamicUINode,
        ...(typeEntries.length > 0 ? [{
          type: "chart" as const,
          chartType: "pie" as const,
          title: "Activities by Type",
          showValues: true,
          showLegend: true,
          data: typeEntries.map(([type, count], idx) => ({
            label: type,
            value: count,
            color: chartColor(idx),
          })),
        } as DynamicUINode] : []),
        ...(trends.byWeek.length > 0 ? [{
          type: "chart" as const,
          chartType: "vertical-bar" as const,
          title: "Weekly Activity Volume",
          showValues: false,
          showLegend: false,
          data: trends.byWeek.map((week, idx) => ({
            label: week.weekStart,
            value: week.count,
            color: chartColor(idx),
          })),
        } as DynamicUINode] : []),
        ...(trends.mostActiveContacts.length > 0 ? [{
          type: "table" as const,
          headers: ["Contact", "Activities"],
          rows: trends.mostActiveContacts.map(c => [c.contactName, String(c.activityCount)]),
        } as DynamicUINode] : []),
      ],
    },
  };

  return {
    richBlocks: [{ type: "dynamic-ui", data: uiData }],
    rawData: { days, totalActivities: trends.totalActivities, byType: trends.byType },
  };
}

function execExportReport(args: Record<string, unknown>): ToolResult {
  const reportType = String(args.report_type || "deals");
  const csv = analytics.exportReportAsCsv(reportType, null);
  const rowCount = csv.split("\n").length - 1; // subtract header row

  return {
    richBlocks: [],
    rawData: { reportType, csv, rowCount },
  };
}
