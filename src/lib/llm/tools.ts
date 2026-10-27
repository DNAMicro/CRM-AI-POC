import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getSchemaDescription } from "@/lib/db";

let _cachedTools: ChatCompletionTool[] | null = null;

export function getCrmTools(): ChatCompletionTool[] {
  if (_cachedTools) return _cachedTools;
  _cachedTools = buildTools();
  return _cachedTools;
}

/** @deprecated Use getCrmTools() instead — retained for backwards compatibility */
export const CRM_TOOLS: ChatCompletionTool[] = [];

function buildTools(): ChatCompletionTool[] {
  const schema = getSchemaDescription();
  return [
  {
    type: "function",
    function: {
      name: "get_dashboard_stats",
      description: "Get overview dashboard statistics: active deals count, pipeline value, deals closing this month, contacts needing follow-up, weighted pipeline value.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "query_contacts",
      description: "Search and filter contacts. Returns a table of contacts.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Free-text search across name, company, email" },
          status: { type: "string", enum: ["active", "inactive", "churned"], description: "Filter by status" },
          needs_follow_up: { type: "boolean", description: "If true, only return contacts not reached in 5+ days" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_contact_detail",
      description: "Get detailed information about a specific contact including their deals and activity history.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "The contact ID (e.g. c1, c2)" },
          name: { type: "string", description: "Contact name to search for if ID is unknown" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_deals",
      description: "Search and filter deals. Returns a table of deals.",
      parameters: {
        type: "object",
        properties: {
          stage: { type: "string", enum: ["lead", "qualified", "proposal", "negotiation", "closed-won", "closed-lost"], description: "Filter by pipeline stage" },
          priority: { type: "string", enum: ["high", "medium", "low"], description: "Filter by priority" },
          contact_id: { type: "string", description: "Filter deals for a specific contact" },
          closing_this_month: { type: "boolean", description: "If true, only deals closing this month" },
          active_only: { type: "boolean", description: "If true, exclude closed-won and closed-lost" },
          min_value: { type: "number", description: "Minimum deal value filter" },
          max_value: { type: "number", description: "Maximum deal value filter" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deal_detail",
      description: "Get detailed information about a specific deal including contact info and activity history.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "The deal ID (e.g. d1, d2)" },
          company: { type: "string", description: "Company name to search for if ID is unknown" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_board",
      description: "Get the full pipeline as a Kanban board view with deals grouped by stage.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_activities",
      description: "Get recent activity history (calls, emails, meetings, notes, deal updates).",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max number of activities to return (default 10)" },
          contact_id: { type: "string", description: "Filter activities for a specific contact" },
          deal_id: { type: "string", description: "Filter activities for a specific deal" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_custom_query",
      description: `Run a custom SQL SELECT query against the CRM database for complex questions that don't fit the predefined tools.

SCHEMA:
${schema}

Only SELECT statements are allowed. Use JOINs for cross-table queries.`,
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "The SELECT SQL query to execute" },
          columns: {
            type: "array",
            description: "Column definitions for displaying results in a table. Each column has key (matching SQL column/alias), label (display name), and optional type (text|currency|date|status|priority).",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                label: { type: "string" },
                type: { type: "string", enum: ["text", "currency", "date", "status", "priority", "badge"] },
              },
              required: ["key", "label"],
            },
          },
        },
        required: ["sql", "columns"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_form",
      description: `Prepare an inline form for the user to create a new contact, deal, or activity. Use this when the user wants to ADD, CREATE, or LOG new data. Extract as much information as possible from the user's message and pass it as prefill values. The form will appear inline in the chat for the user to review, edit, and submit.`,
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            enum: ["contact", "deal", "activity"],
            description: "The type of entity to create",
          },
          prefill: {
            type: "object",
            description: `Pre-filled values extracted from the user's message. Keys depend on entity_type:
- contact: firstName, lastName, email, company, title, phone, status, tags (comma-separated string)
- deal: name, company, value (number), stage, priority, closeDate (YYYY-MM-DD), contactId
- activity: type (call|email|meeting|note|task|deal-update), contactId, dealId, description`,
          },
        },
        required: ["entity_type", "prefill"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_contact",
      description: "Update an existing contact's information. Use when the user wants to EDIT, UPDATE, or CHANGE a contact's details. Look up the contact ID first if unknown.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "The contact ID (e.g. c1, c2). Use query_contacts or get_contact_detail to find the ID if unknown." },
          updates: {
            type: "object",
            description: "Fields to update. Only include fields that should change.",
            properties: {
              firstName: { type: "string" },
              lastName: { type: "string" },
              email: { type: "string" },
              company: { type: "string" },
              title: { type: "string" },
              phone: { type: "string" },
              status: { type: "string", enum: ["active", "inactive", "churned"] },
              tags: { type: "array", items: { type: "string" } },
            },
          },
        },
        required: ["contact_id", "updates"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal",
      description: "Update an existing deal's information including stage changes. Use when the user wants to EDIT, UPDATE, CHANGE, or MOVE a deal. Stage changes automatically log an activity and adjust probability.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "The deal ID (e.g. d1, d2). Use query_deals or get_deal_detail to find the ID if unknown." },
          updates: {
            type: "object",
            description: "Fields to update. Only include fields that should change.",
            properties: {
              name: { type: "string" },
              company: { type: "string" },
              value: { type: "number" },
              stage: { type: "string", enum: ["lead", "qualified", "proposal", "negotiation", "closed-won", "closed-lost"] },
              probability: { type: "number" },
              closeDate: { type: "string", description: "ISO date string" },
              priority: { type: "string", enum: ["high", "medium", "low"] },
            },
          },
        },
        required: ["deal_id", "updates"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_entity",
      description: "Delete a contact, deal, or activity. IMPORTANT: Always confirm with the user before deleting. Contacts with existing deals cannot be deleted — their deals must be removed first.",
      parameters: {
        type: "object",
        properties: {
          entity_type: { type: "string", enum: ["contact", "deal", "activity"], description: "Type of entity to delete" },
          entity_id: { type: "string", description: "The entity ID to delete" },
        },
        required: ["entity_type", "entity_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_edit_form",
      description: "Prepare an inline edit form pre-filled with the entity's current values. Use when the user wants to edit a contact or deal through a form interface.",
      parameters: {
        type: "object",
        properties: {
          entity_type: { type: "string", enum: ["contact", "deal"], description: "Type of entity to edit" },
          entity_id: { type: "string", description: "The entity ID to edit" },
        },
        required: ["entity_type", "entity_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Prepare an email compose form for the user to review and send. NEVER auto-sends. You MUST write a complete, professional email body in body_html — never leave it empty. Compose a real email with greeting, message, and sign-off based on what the user wants to say.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "Contact ID (e.g. c1). Look up first if unknown." },
          contact_name: { type: "string", description: "Contact name to search for if ID is unknown" },
          subject: { type: "string", description: "A clear, concise email subject line" },
          body_html: { type: "string", description: "REQUIRED. The full email body as HTML. Write a complete, natural email with <p> tags — greeting, message content, sign-off. Never leave empty." },
          body_text: { type: "string", description: "Plain text version of the email body" },
          in_reply_to: { type: "string", description: "Gmail message ID if this is a reply" },
        },
        required: ["subject", "body_html"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_emails",
      description: "Get emails from the connected Gmail inbox. Can filter by contact. Use when the user asks to see their inbox, emails, or emails from a specific person.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "Filter emails for a specific contact" },
          contact_name: { type: "string", description: "Contact name to search for if ID unknown" },
          unread_only: { type: "boolean", description: "Only show unread emails" },
          limit: { type: "number", description: "Max emails to return (default 15)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_email_thread",
      description: "Get a full email thread/conversation by thread ID. Use when the user clicks on an email or asks to see a specific email conversation.",
      parameters: {
        type: "object",
        properties: {
          thread_id: { type: "string", description: "Gmail thread ID" },
        },
        required: ["thread_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_integrations_status",
      description: "Check the connection status of email (Gmail) and SMS (Twilio) integrations. Use when the user asks about their integrations or when you need to verify if Gmail/SMS is connected before using email/SMS tools.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "send_outlook_email",
      description: "Prepare an Outlook email compose form for the user to review and send via Office 365. NEVER auto-sends. You MUST write a complete, professional email body in body_html — never leave it empty.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "Contact ID (e.g. c1). Look up first if unknown." },
          contact_name: { type: "string", description: "Contact name to search for if ID is unknown" },
          subject: { type: "string", description: "A clear, concise email subject line" },
          body_html: { type: "string", description: "REQUIRED. The full email body as HTML with <p> tags — greeting, message, sign-off. Never leave empty." },
          body_text: { type: "string", description: "Plain text version of the email body" },
          in_reply_to: { type: "string", description: "Outlook conversation ID if this is a reply" },
        },
        required: ["subject", "body_html"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_outlook_inbox",
      description: "Get emails from the connected Office 365 Outlook inbox. Can filter by contact. Use when the user asks to see their Outlook inbox or Outlook emails.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "Filter emails for a specific contact" },
          contact_name: { type: "string", description: "Contact name to search for if ID unknown" },
          unread_only: { type: "boolean", description: "Only show unread emails" },
          limit: { type: "number", description: "Max emails to return (default 15)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_outlook_thread",
      description: "Get a full Outlook email thread/conversation by conversation ID.",
      parameters: {
        type: "object",
        properties: {
          conversation_id: { type: "string", description: "Outlook conversation ID" },
        },
        required: ["conversation_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_calendar_events",
      description: "Get upcoming calendar events from Office 365. Use when the user asks about their schedule, meetings, or calendar. Defaults to next 14 days.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date ISO 8601. Defaults to now." },
          end_date: { type: "string", description: "End date ISO 8601. Defaults to 14 days from now." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new calendar event in Office 365. Parse natural language dates into ISO 8601.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Event title/subject" },
          start_time: { type: "string", description: "Start time ISO 8601 (e.g. 2026-04-11T15:00:00)" },
          end_time: { type: "string", description: "End time ISO 8601 (e.g. 2026-04-11T16:00:00)" },
          location: { type: "string", description: "Event location" },
          body_html: { type: "string", description: "Event description as HTML" },
          attendee_emails: { type: "array", items: { type: "string" }, description: "Attendee email addresses" },
        },
        required: ["subject", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "import_outlook_contacts",
      description: "Import contacts from Office 365 into the CRM. Shows a dedup preview first.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ===== SMART FOLLOW-UP TOOLS =====

  {
    type: "function",
    function: {
      name: "get_stale_deals",
      description: "Get deals with no activity in N days (default 7). Use when the user asks about neglected deals, deals needing attention, or deals with no recent activity.",
      parameters: {
        type: "object",
        properties: {
          min_days: { type: "number", description: "Minimum days of inactivity to consider a deal stale (default 7)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_follow_up_suggestions",
      description: "Get a prioritized list of contacts who need follow-up. Use when the user asks 'who should I follow up with?', 'what follow-ups do I need?', or when planning their day.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Minimum days since last contact to include (default 5)" },
          limit: { type: "number", description: "Max number of suggestions to return (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_next_actions",
      description: "Get stage-appropriate next-action suggestions for deals. Use when the user asks 'what should I do next?', 'what are my priorities?', or 'what's the next step for [deal]?'.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Optional: limit suggestions to a specific deal ID" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_email_template",
      description: "Save an email template with merge fields (e.g. {{contact.firstName}}, {{deal.name}}). Use when the user says 'save this as a template' or 'create a template called [name]'.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Template name (unique identifier)" },
          subject: { type: "string", description: "Email subject line, may include merge fields" },
          body_html: { type: "string", description: "Email body as HTML, may include merge fields" },
          body_text: { type: "string", description: "Email body as plain text, may include merge fields" },
        },
        required: ["name", "subject", "body_html"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_email_templates",
      description: "List all saved email templates. Use when the user asks to see their templates or wants to choose one to apply.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_email_template",
      description: "Apply an email template for a specific contact and/or deal, filling in merge fields. Use when the user wants to use a template to compose an email.",
      parameters: {
        type: "object",
        properties: {
          template_id: { type: "string", description: "The template ID to apply" },
          template_name: { type: "string", description: "Template name to search for if ID is unknown" },
          contact_id: { type: "string", description: "Contact ID to merge into the template" },
          contact_name: { type: "string", description: "Contact name to search for if ID is unknown" },
          deal_id: { type: "string", description: "Deal ID to merge into the template" },
        },
        required: ["template_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_message",
      description: "Schedule a future email or SMS send. Use when the user says 'send this tomorrow at 9am', 'schedule for Friday', or any future send time. Parse natural language dates into ISO 8601.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["email", "sms"], description: "Message type: email or sms" },
          contact_id: { type: "string", description: "Contact ID to send to. Look up first if unknown." },
          contact_name: { type: "string", description: "Contact name to search for if ID is unknown" },
          subject: { type: "string", description: "Email subject (for email type)" },
          body_html: { type: "string", description: "Message body as HTML (for email type)" },
          body_text: { type: "string", description: "Message body as plain text" },
          scheduled_at: { type: "string", description: "Scheduled send time in ISO 8601 format (e.g. 2026-04-11T09:00:00)" },
          provider: { type: "string", enum: ["gmail", "outlook", "twilio"], description: "Sending provider (default: gmail for email, twilio for sms)" },
        },
        required: ["type", "scheduled_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_morning_briefing",
      description: "Get a comprehensive morning briefing with stale deals, follow-ups, tasks, calendar events, and pipeline stats. Use when the user says 'brief me', 'morning briefing', 'what's my day look like?', or at the start of a new conversation.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ===== AI Intelligence Tools =====
  {
    type: "function",
    function: {
      name: "get_lead_scores",
      description: "Get lead scores (0-100) for contacts based on email activity, meetings, recency, deal progression, and calls. Use when the user asks about lead scores, hot leads, best prospects, or contact engagement levels.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max contacts to return (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deal_health",
      description: "Get health indicators (green/yellow/red) for active deals based on time in stage, activity recency, activity volume, and close date proximity. Use when the user asks about deal health, at-risk deals, or pipeline health.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Specific deal ID (optional — omit for all active deals)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_relationship_map",
      description: "Map relationship strength (strong/moderate/weak/dormant) for contacts based on communication frequency, recency, and deal involvement. Use when the user asks about relationship health, engagement levels, or which contacts need attention.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max contacts to return (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_insights",
      description: "Get AI-generated sales insights including win rate, average deal size, sales cycle time, pipeline bottlenecks, at-risk deals, and re-engagement opportunities. Use when the user asks for insights, patterns, or 'how am I doing?'.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ===== Analytics & Reporting Tools =====
  {
    type: "function",
    function: {
      name: "get_pipeline_trends",
      description: "Get pipeline value trends over time, showing how pipeline value has changed across stages and weeks. Use when the user asks about pipeline trends, pipeline growth, or how their pipeline has changed over time.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of days to look back for trend data (default 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_revenue_forecast",
      description: "Get monthly revenue forecast vs closed revenue, showing projected vs actual revenue by month. Use when the user asks about revenue forecast, revenue projections, or expected revenue.",
      parameters: {
        type: "object",
        properties: {
          months: { type: "number", description: "Number of months to forecast (default 6)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_velocity",
      description: "Get sales velocity metrics including average sales cycle time, stage-by-stage conversion rates, and overall pipeline velocity. Use when the user asks about sales velocity, cycle time, conversion rates, or pipeline speed.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_win_loss_analysis",
      description: "Get win/loss analysis including win rate, average deal sizes for won vs lost deals, and breakdowns by stage, priority, and time period. Use when the user asks about win rate, why deals are lost, or win/loss breakdown.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date for analysis in YYYY-MM-DD format (optional)" },
          end_date: { type: "string", description: "End date for analysis in YYYY-MM-DD format (optional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_activity_trends",
      description: "Get activity volume trends by type (calls, emails, meetings, notes) and by week. Use when the user asks about activity trends, communication patterns, or activity volume over time.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of days to look back for activity trend data (default 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "export_report",
      description: "Export CRM data as a CSV file for download. Use when the user asks to export, download, or get a report of deals, contacts, activities, or pipeline data.",
      parameters: {
        type: "object",
        properties: {
          report_type: {
            type: "string",
            enum: ["deals", "contacts", "activities", "pipeline"],
            description: "The type of report to export as CSV",
          },
        },
        required: ["report_type"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "send_sms",
      description: "Prepare an SMS compose form for the user to review and send. NEVER auto-sends — shows the compose form first. Use when the user wants to text, message, or SMS a contact. The contact must have a phone number.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "Contact ID (e.g. c1). Look up first if unknown." },
          contact_name: { type: "string", description: "Contact name to search for if ID is unknown" },
          message: { type: "string", description: "The text message body (keep under 160 chars for single SMS segment)" },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sms_history",
      description: "Get SMS message history with a contact. Shows the conversation thread. Use when the user asks to see texts or messages with someone.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "Contact ID to get SMS history for" },
          contact_name: { type: "string", description: "Contact name to search for if ID unknown" },
          limit: { type: "number", description: "Max messages to return (default 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_dynamic_ui",
      description: `Generate a custom visual UI when the user's request doesn't fit standard views (tables, pipeline board, contact cards). Use for dashboards, comparisons, breakdowns, funnels, or any custom visualization.

IMPORTANT: First fetch data using other tools (query_deals, run_custom_query, etc.), then call this tool with a layout tree that contains ACTUAL DATA VALUES from your query results. The layout must include real numbers — do not generate empty layouts with just titles. For charts, always populate the data array with the values you fetched.

Available node types:
- heading: { type: "heading", level: 1|2|3, text: "..." }
- text: { type: "text", content: "..." (supports **bold**), muted?: boolean }
- metric: { type: "metric", label: "...", value: "...", subtext?: "...", trend?: "up"|"down"|"neutral", trendValue?: "..." }
- progress-bar: { type: "progress-bar", label: "...", value: 0-100, color?: "indigo"|"emerald"|"amber"|"red"|"violet"|"blue", showValue?: boolean, suffix?: "%" }
- bar-chart: { type: "bar-chart", title?: "...", bars: [{ label: "...", value: number, color?: "..." }], maxValue?: number }
- chart: { type: "chart", chartType: "pie"|"donut"|"line"|"area"|"vertical-bar", data: [{ label: "...", value: number, color?: "indigo"|"emerald"|"amber"|"red"|"violet"|"blue" }], title?: "...", showLegend?: boolean, showValues?: boolean }
- grid: { type: "grid", columns: 1|2|3|4, children: [...nodes] }
- card: { type: "card", title?: "...", children: [...nodes] }
- stack: { type: "stack", direction: "vertical"|"horizontal", gap?: "sm"|"md"|"lg", children: [...nodes] }
- table: { type: "table", headers: ["..."], rows: [["...", "..."]] }
- list: { type: "list", items: [{ label: "...", value?: "..." }], ordered?: boolean }
- badge-group: { type: "badge-group", badges: [{ text: "...", color?: "indigo"|"emerald"|"amber"|"red"|"violet"|"blue"|"slate" }] }
- divider: { type: "divider" }
- callout: { type: "callout", variant: "info"|"warning"|"success"|"error", title?: "...", content: "..." }
- timeline: { type: "timeline", items: [{ label: "...", description?: "...", timestamp?: "...", color?: "indigo"|... }] }
- stat-row: { type: "stat-row", stats: [{ label: "...", value: "...", change?: "+5%", trend?: "up"|"down"|"neutral" }] }
- key-value: { type: "key-value", pairs: [{ key: "...", value: "..." }], columns?: 1|2|3 }

Compose into layouts: e.g. a stack containing a grid of metrics and a pie chart, or a grid of cards each with lists and progress bars. Use "chart" for pie charts, donut charts, line charts, area charts, and vertical bar charts. Use "callout" for alerts/notices, "timeline" for sequential events, "stat-row" for horizontal metric strips, "key-value" for detail panels.`,
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Dashboard/visualization title" },
          description: { type: "string", description: "Brief description of what this shows" },
          layout: { type: "object", description: "Root UI node (typically a stack or grid containing children)" },
        },
        required: ["layout"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "attach_file",
      description: "Link an uploaded file to a contact or deal. The user uploads files through the chat interface — file metadata (id, filename) is included in the message. Use this tool to associate uploaded files with the correct entity in the CRM.",
      parameters: {
        type: "object",
        properties: {
          file_id: { type: "string", description: "The file attachment ID from the user's message" },
          contact_id: { type: "string", description: "Contact ID to attach file to" },
          contact_name: { type: "string", description: "Contact name if ID is unknown — will search for match" },
          deal_id: { type: "string", description: "Deal ID to attach file to" },
          description: { type: "string", description: "Optional description of what this file is" },
        },
        required: ["file_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_attachments",
      description: "Get files attached to a contact or deal. Use when the user asks to see files, documents, or attachments for an entity.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "Contact ID to get attachments for" },
          contact_name: { type: "string", description: "Contact name if ID unknown" },
          deal_id: { type: "string", description: "Deal ID to get attachments for" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a task or reminder. Use when the user says 'remind me', 'follow up', 'schedule', 'add a task', or any forward-looking action item. Extract the due date from context (e.g. 'Thursday' = next Thursday). Look up contact/deal IDs if referenced by name.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short task title" },
          description: { type: "string", description: "Additional details" },
          due_date: { type: "string", description: "Due date in YYYY-MM-DD format" },
          due_time: { type: "string", description: "Optional due time in HH:MM format" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          contact_id: { type: "string", description: "Contact ID to link the task to" },
          contact_name: { type: "string", description: "Contact name if ID unknown — will search" },
          deal_id: { type: "string", description: "Deal ID to link the task to" },
          reminder_minutes: { type: "number", description: "Minutes before due time to send a browser notification. Values: 0 (at due time), 5, 15, 30, or 60. Default: 15 for tasks with a specific time." },
        },
        required: ["title", "due_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tasks",
      description: "Get tasks/reminders. Use when the user asks 'what should I do today?', 'show my tasks', 'what's overdue?', 'what's due this week?'. Returns tasks grouped by overdue, today, and upcoming.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "completed", "cancelled"] },
          contact_id: { type: "string", description: "Filter tasks for a specific contact" },
          deal_id: { type: "string", description: "Filter tasks for a specific deal" },
          include_overdue: { type: "boolean", description: "Include overdue tasks (default true)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task as completed. Use when the user says 'done', 'completed', 'mark as done', 'finished'. Optionally log the completion as an activity.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "The task ID to complete" },
          log_activity: { type: "boolean", description: "If true, also log the completion as an activity (default false)" },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "global_search",
      description: "Search across all CRM data: contacts, deals, activities, tasks, and emails. Use when the user says 'find', 'search for', 'anything related to', or asks a broad question about an entity.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
          entity_types: {
            type: "array",
            items: { type: "string", enum: ["contact", "deal", "activity", "task", "email", "sms"] },
            description: "Optional: limit search to specific entity types",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "import_contacts",
      description: "Import contacts from a CSV file. The user must have uploaded a CSV file first. This parses the CSV and creates contacts. Shows a preview before confirming.",
      parameters: {
        type: "object",
        properties: {
          file_id: { type: "string", description: "The uploaded file ID from the user's message attachments" },
        },
        required: ["file_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "export_contacts",
      description: "Export contacts as a CSV download. Use when the user asks to export, download, or backup their contacts.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "inactive", "churned"], description: "Optional filter by status" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_update",
      description: "Perform a bulk update on multiple entities. Shows a preview of affected records before executing. Use for operations like 'mark all Acme contacts as inactive' or 'update priority on all closing deals'.",
      parameters: {
        type: "object",
        properties: {
          entity_type: { type: "string", enum: ["contact", "deal", "task"], description: "Type of entities to update" },
          filter: { type: "object", description: "Filter criteria to select entities (e.g. {company: 'Acme Corp', status: 'active'})" },
          updates: { type: "object", description: "Fields to update on matching entities" },
          confirm: { type: "boolean", description: "Set to true to execute. If false or omitted, shows preview only." },
        },
        required: ["entity_type", "filter", "updates"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_pipeline_report",
      description: "Generate a visual pipeline/revenue report with charts. Use when the user asks for 'pipeline report', 'quarterly report', 'revenue analysis', 'win rate', or 'deal metrics'. Fetches data and produces a rich dashboard using DynamicUI.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_activity_report",
      description: "Generate an activity report showing activity volume, types, and trends. Use when the user asks for 'activity report', 'activity summary', 'communication history', or 'what have I been doing?'.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of days to look back (default 30)" },
        },
      },
    },
  },
];
}
