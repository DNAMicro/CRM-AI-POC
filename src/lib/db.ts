import Database from "better-sqlite3";
import path from "path";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Contact, Deal, Activity, Task, PipelineStage } from "@/types/crm";
import type { SqlQuery } from "@/types/conversation";

const DB_PATH = path.join(process.cwd(), "data", "crm.db");
// Committed demo snapshot; copied to DB_PATH on first run so the working DB stays out of git
const DEMO_DB_PATH = path.join(process.cwd(), "data", "demo.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const fs = require("fs");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DB_PATH) && fs.existsSync(DEMO_DB_PATH)) {
      fs.copyFileSync(DEMO_DB_PATH, DB_PATH);
    }

    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
    autoSeedIfEmpty(_db);
    instrumentPrepare(_db);
  }
  return _db;
}

// ===== SQL capture (tool-call debug panel) =====

const MAX_LOGGED_QUERIES = 50;
const MAX_PARAM_LENGTH = 200;
const EXECUTING_METHODS = new Set<PropertyKey>(["run", "get", "all", "iterate"]);

const sqlLog = new AsyncLocalStorage<{ queries: SqlQuery[]; omitted: number }>();

/** Runs fn and returns every SQL statement it executed, with parameters. */
export function captureSql<T>(fn: () => T): { result: T; sql: SqlQuery[]; sqlOmitted: number } {
  const store = { queries: [] as SqlQuery[], omitted: 0 };
  const result = sqlLog.run(store, fn);
  return { result, sql: store.queries, sqlOmitted: store.omitted };
}

function summarizeParam(value: unknown): unknown {
  if (typeof value === "string" && value.length > MAX_PARAM_LENGTH) return `${value.slice(0, MAX_PARAM_LENGTH)}…`;
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `<${value.length} bytes>`;
  return value;
}

function recordQuery(sql: string, args: unknown[]) {
  const store = sqlLog.getStore();
  if (!store) return;
  if (store.queries.length >= MAX_LOGGED_QUERIES) {
    store.omitted++;
    return;
  }
  // better-sqlite3 takes positional values, one array, or a named-parameter object
  const single = args.length === 1 ? args[0] : undefined;
  const isNamed = single !== null && typeof single === "object" && !Array.isArray(single) && !Buffer.isBuffer(single);
  const params = isNamed
    ? Object.fromEntries(Object.entries(single as Record<string, unknown>).map(([k, v]) => [k, summarizeParam(v)]))
    : (Array.isArray(single) ? single : args).map(summarizeParam);
  store.queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
}

// Wrap statements so executing them is logged while captureSql is active.
// Outside a capture the only cost is one AsyncLocalStorage lookup per call.
function instrumentPrepare(db: Database.Database) {
  const prepare = db.prepare.bind(db);
  db.prepare = ((source: string) => {
    const stmt = prepare(source);
    const proxy: typeof stmt = new Proxy(stmt, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          if (EXECUTING_METHODS.has(prop)) recordQuery(source, args);
          const result = value.apply(target, args);
          // Keep chained calls like stmt.pluck().all() on the proxy
          return result === target ? proxy : result;
        };
      },
    });
    return proxy;
  }) as typeof db.prepare;
}

function safeAddColumn(db: Database.Database, table: string, column: string, definition: string) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch {
    // Column already exists
  }
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      phone TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('active','inactive','churned')),
      tags TEXT DEFAULT '[]',
      lastContactedAt TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contactId TEXT REFERENCES contacts(id),
      company TEXT NOT NULL,
      value REAL NOT NULL,
      stage TEXT NOT NULL CHECK(stage IN ('lead','qualified','proposal','negotiation','closed-won','closed-lost')),
      probability REAL NOT NULL,
      closeDate TEXT NOT NULL,
      assignedTo TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('high','medium','low')),
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('call','email','meeting','note','task','deal-update')),
      contactId TEXT NOT NULL,
      dealId TEXT,
      description TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metadata TEXT,
      FOREIGN KEY (contactId) REFERENCES contacts(id),
      FOREIGN KEY (dealId) REFERENCES deals(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      gmailMessageId TEXT UNIQUE,
      gmailThreadId TEXT,
      contactId TEXT,
      direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
      fromAddress TEXT NOT NULL,
      toAddress TEXT NOT NULL,
      ccAddress TEXT DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      bodyHtml TEXT NOT NULL DEFAULT '',
      bodyText TEXT NOT NULL DEFAULT '',
      isRead INTEGER NOT NULL DEFAULT 0,
      labels TEXT DEFAULT '[]',
      sentAt TEXT NOT NULL,
      syncedAt TEXT NOT NULL,
      FOREIGN KEY (contactId) REFERENCES contacts(id)
    );

    CREATE TABLE IF NOT EXISTS sms_messages (
      id TEXT PRIMARY KEY,
      providerMessageId TEXT UNIQUE,
      contactId TEXT,
      direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
      fromNumber TEXT NOT NULL,
      toNumber TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      sentAt TEXT NOT NULL,
      FOREIGN KEY (contactId) REFERENCES contacts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_emails_contact ON emails(contactId);
    CREATE INDEX IF NOT EXISTS idx_emails_gmail_id ON emails(gmailMessageId);
    CREATE INDEX IF NOT EXISTS idx_emails_read ON emails(isRead);
    CREATE INDEX IF NOT EXISTS idx_sms_contact ON sms_messages(contactId);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      originalName TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      size INTEGER NOT NULL,
      url TEXT NOT NULL,
      contactId TEXT,
      dealId TEXT,
      description TEXT,
      uploadedAt TEXT NOT NULL,
      FOREIGN KEY (contactId) REFERENCES contacts(id),
      FOREIGN KEY (dealId) REFERENCES deals(id)
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_contact ON attachments(contactId);
    CREATE INDEX IF NOT EXISTS idx_attachments_deal ON attachments(dealId);

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New conversation',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL DEFAULT '',
      richBlocks TEXT DEFAULT '[]',
      suggestedChips TEXT DEFAULT '[]',
      attachments TEXT DEFAULT '[]',
      debugToolCalls TEXT DEFAULT '[]',
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conv_messages_conv ON conversation_messages(conversationId);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      dueDate TEXT NOT NULL,
      dueTime TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
      contactId TEXT REFERENCES contacts(id),
      dealId TEXT REFERENCES deals(id),
      completedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(dueDate);

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      outlookEventId TEXT UNIQUE,
      subject TEXT NOT NULL,
      bodyPreview TEXT DEFAULT '',
      startTime TEXT NOT NULL,
      endTime TEXT NOT NULL,
      location TEXT DEFAULT '',
      isAllDay INTEGER NOT NULL DEFAULT 0,
      organizerEmail TEXT DEFAULT '',
      organizerName TEXT DEFAULT '',
      attendees TEXT DEFAULT '[]',
      contactId TEXT,
      dealId TEXT,
      webLink TEXT DEFAULT '',
      syncedAt TEXT NOT NULL,
      FOREIGN KEY (contactId) REFERENCES contacts(id),
      FOREIGN KEY (dealId) REFERENCES deals(id)
    );

    CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(startTime);
    CREATE INDEX IF NOT EXISTS idx_calendar_outlook_id ON calendar_events(outlookEventId);
    -- idx_emails_outlook_id and idx_emails_source created after safeAddColumn calls below

    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      bodyHtml TEXT NOT NULL,
      bodyText TEXT NOT NULL,
      mergeFields TEXT DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('email', 'sms')),
      provider TEXT NOT NULL DEFAULT 'gmail' CHECK(provider IN ('gmail', 'outlook', 'twilio')),
      contactId TEXT,
      recipientAddress TEXT NOT NULL,
      subject TEXT DEFAULT '',
      bodyHtml TEXT DEFAULT '',
      bodyText TEXT DEFAULT '',
      scheduledAt TEXT NOT NULL,
      sentAt TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed', 'cancelled')),
      createdAt TEXT NOT NULL,
      FOREIGN KEY (contactId) REFERENCES contacts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_messages(status);
    CREATE INDEX IF NOT EXISTS idx_scheduled_time ON scheduled_messages(scheduledAt);

    CREATE TABLE IF NOT EXISTS pipeline_snapshots (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      stage TEXT NOT NULL,
      dealCount INTEGER NOT NULL,
      totalValue REAL NOT NULL,
      weightedValue REAL NOT NULL,
      UNIQUE(date, stage)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_date ON pipeline_snapshots(date);
  `);

  // Office 365 schema extensions (additive)
  safeAddColumn(db, "emails", "source", "TEXT NOT NULL DEFAULT 'gmail'");
  safeAddColumn(db, "emails", "outlookMessageId", "TEXT UNIQUE");
  safeAddColumn(db, "emails", "outlookConversationId", "TEXT");

  // Create indexes on the new columns (safe — IF NOT EXISTS)
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_emails_outlook_id ON emails(outlookMessageId)"); } catch { /* column may not exist in edge cases */ }
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_emails_source ON emails(source)"); } catch { /* column may not exist in edge cases */ }

  safeAddColumn(db, "tasks", "reminderMinutes", "INTEGER");
  safeAddColumn(db, "tasks", "reminderFiredAt", "TEXT");

  // Migration: add updatedAt to contacts if not present
  try {
    db.exec("ALTER TABLE contacts ADD COLUMN updatedAt TEXT;");
  } catch {
    // Column already exists, ignore
  }

  // Migration: add 'sms' to activities type CHECK constraint
  // SQLite doesn't support ALTER CHECK constraints, so we recreate the table if needed
  try {
    // Test if 'sms' type is already allowed
    const testStmt = db.prepare("INSERT INTO activities (id, type, contactId, description, timestamp) VALUES ('__test_sms__', 'sms', '__none__', 'test', '')");
    testStmt.run();
    db.prepare("DELETE FROM activities WHERE id = '__test_sms__'").run();
  } catch {
    // 'sms' type not allowed — recreate table with updated constraint
    db.exec(`
      CREATE TABLE IF NOT EXISTS activities_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('call','email','meeting','note','task','deal-update','sms')),
        contactId TEXT NOT NULL,
        dealId TEXT,
        description TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        metadata TEXT,
        FOREIGN KEY (contactId) REFERENCES contacts(id),
        FOREIGN KEY (dealId) REFERENCES deals(id)
      );
      INSERT INTO activities_new SELECT * FROM activities;
      DROP TABLE activities;
      ALTER TABLE activities_new RENAME TO activities;
    `);
  }
}

function autoSeedIfEmpty(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) as cnt FROM contacts").get() as { cnt: number };
  if (count.cnt > 0) return;

  // Dynamic import of static data for seeding
  const { contacts } = require("@/data/contacts");
  const { deals } = require("@/data/deals");
  const { activities } = require("@/data/activities");

  const insertContact = db.prepare(`
    INSERT INTO contacts (id, firstName, lastName, email, company, title, phone, avatar, status, tags, lastContactedAt, createdAt)
    VALUES (@id, @firstName, @lastName, @email, @company, @title, @phone, @avatar, @status, @tags, @lastContactedAt, @createdAt)
  `);
  const insertDeal = db.prepare(`
    INSERT INTO deals (id, name, contactId, company, value, stage, probability, closeDate, assignedTo, priority, createdAt, updatedAt)
    VALUES (@id, @name, @contactId, @company, @value, @stage, @probability, @closeDate, @assignedTo, @priority, @createdAt, @updatedAt)
  `);
  const insertActivity = db.prepare(`
    INSERT INTO activities (id, type, contactId, dealId, description, timestamp, metadata)
    VALUES (@id, @type, @contactId, @dealId, @description, @timestamp, @metadata)
  `);

  const seed = db.transaction(() => {
    for (const c of contacts) {
      insertContact.run({ ...c, tags: JSON.stringify(c.tags) });
    }
    for (const d of deals) {
      insertDeal.run(d);
    }
    for (const a of activities) {
      insertActivity.run({ ...a, dealId: a.dealId || null, metadata: a.metadata ? JSON.stringify(a.metadata) : null });
    }
  });
  seed();
}

// --- Helper to parse contact tags ---
function parseContact(row: Record<string, unknown>): Contact {
  return { ...row, tags: JSON.parse(row.tags as string || "[]") } as Contact;
}

// ===== CONTACT QUERIES =====

export function getAllContacts(): Contact[] {
  return getDb().prepare("SELECT * FROM contacts ORDER BY lastName, firstName").all().map(r => parseContact(r as Record<string, unknown>));
}

export function getContact(id: string): Contact | undefined {
  const row = getDb().prepare("SELECT * FROM contacts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? parseContact(row) : undefined;
}

export function searchContacts(query: string): Contact[] {
  const q = `%${query}%`;
  return getDb().prepare(`
    SELECT * FROM contacts
    WHERE (firstName || ' ' || lastName) LIKE ? OR company LIKE ? OR email LIKE ?
    ORDER BY lastName, firstName
  `).all(q, q, q).map(r => parseContact(r as Record<string, unknown>));
}

export function getContactsNeedingFollowUp(days: number = 5): Contact[] {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return getDb().prepare(`
    SELECT * FROM contacts
    WHERE lastContactedAt < ? AND status = 'active'
    ORDER BY lastContactedAt ASC
  `).all(cutoff).map(r => parseContact(r as Record<string, unknown>));
}

// ===== DEAL QUERIES =====

export function getAllDeals(): Deal[] {
  return getDb().prepare("SELECT * FROM deals ORDER BY updatedAt DESC").all() as Deal[];
}

export function getDeal(id: string): Deal | undefined {
  return getDb().prepare("SELECT * FROM deals WHERE id = ?").get(id) as Deal | undefined;
}

export function getDealsByStage(stage: PipelineStage): Deal[] {
  return getDb().prepare("SELECT * FROM deals WHERE stage = ? ORDER BY value DESC").all(stage) as Deal[];
}

export function getDealsByContact(contactId: string): Deal[] {
  return getDb().prepare("SELECT * FROM deals WHERE contactId = ? ORDER BY updatedAt DESC").all(contactId) as Deal[];
}

export function getActiveDeals(): Deal[] {
  return getDb().prepare("SELECT * FROM deals WHERE stage NOT IN ('closed-won','closed-lost') ORDER BY value DESC").all() as Deal[];
}

export function getDealsClosingThisMonth(): Deal[] {
  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
  const today = now.toISOString();
  return getDb().prepare(`
    SELECT * FROM deals
    WHERE closeDate <= ? AND closeDate >= ? AND stage NOT IN ('closed-won','closed-lost')
    ORDER BY closeDate ASC
  `).all(monthEnd, today) as Deal[];
}

export function getPipelineValue(): number {
  const row = getDb().prepare("SELECT COALESCE(SUM(value),0) as total FROM deals WHERE stage NOT IN ('closed-won','closed-lost')").get() as { total: number };
  return row.total;
}

export function getWeightedPipelineValue(): number {
  const row = getDb().prepare("SELECT COALESCE(SUM(value * probability / 100.0),0) as total FROM deals WHERE stage NOT IN ('closed-won','closed-lost')").get() as { total: number };
  return row.total;
}

// ===== ACTIVITY QUERIES =====

export function getActivitiesByContact(contactId: string): Activity[] {
  return getDb().prepare("SELECT * FROM activities WHERE contactId = ? ORDER BY timestamp DESC").all(contactId) as Activity[];
}

export function getActivitiesByDeal(dealId: string): Activity[] {
  return getDb().prepare("SELECT * FROM activities WHERE dealId = ? ORDER BY timestamp DESC").all(dealId) as Activity[];
}

export function getRecentActivities(count: number = 10): Activity[] {
  return getDb().prepare("SELECT * FROM activities ORDER BY timestamp DESC LIMIT ?").all(count) as Activity[];
}

export function getActivity(id: string): Activity | undefined {
  return getDb().prepare("SELECT * FROM activities WHERE id = ?").get(id) as Activity | undefined;
}

export function getLastActivityDateForDeal(dealId: string): string | null {
  const row = getDb().prepare(
    "SELECT MAX(timestamp) as lastActivity FROM activities WHERE dealId = ?"
  ).get(dealId) as { lastActivity: string | null };
  return row?.lastActivity || null;
}

export function getLastActivityDateForContact(contactId: string): string | null {
  const row = getDb().prepare(
    "SELECT MAX(timestamp) as lastActivity FROM activities WHERE contactId = ?"
  ).get(contactId) as { lastActivity: string | null };
  return row?.lastActivity || null;
}

// ===== AGGREGATE QUERIES FOR INTELLIGENCE =====

export function getEmailCountByContact(contactId: string, opts?: { inLastDays?: number }): number {
  const db = getDb();
  let sql = "SELECT COUNT(*) as cnt FROM emails WHERE contactId = ?";
  const params: unknown[] = [contactId];
  if (opts?.inLastDays) {
    const cutoff = new Date(Date.now() - opts.inLastDays * 24 * 60 * 60 * 1000).toISOString();
    sql += " AND sentAt >= ?";
    params.push(cutoff);
  }
  return (db.prepare(sql).get(...params) as { cnt: number }).cnt;
}

export function getSmsCountByContact(contactId: string, opts?: { inLastDays?: number }): number {
  const db = getDb();
  let sql = "SELECT COUNT(*) as cnt FROM sms_messages WHERE contactId = ?";
  const params: unknown[] = [contactId];
  if (opts?.inLastDays) {
    const cutoff = new Date(Date.now() - opts.inLastDays * 24 * 60 * 60 * 1000).toISOString();
    sql += " AND sentAt >= ?";
    params.push(cutoff);
  }
  return (db.prepare(sql).get(...params) as { cnt: number }).cnt;
}

export function getActivityCountByType(contactId: string, opts?: { type?: string; inLastDays?: number }): number {
  const db = getDb();
  const conditions: string[] = ["contactId = ?"];
  const params: unknown[] = [contactId];
  if (opts?.type) {
    conditions.push("type = ?");
    params.push(opts.type);
  }
  if (opts?.inLastDays) {
    const cutoff = new Date(Date.now() - opts.inLastDays * 24 * 60 * 60 * 1000).toISOString();
    conditions.push("timestamp >= ?");
    params.push(cutoff);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  return (db.prepare(`SELECT COUNT(*) as cnt FROM activities ${where}`).get(...params) as { cnt: number }).cnt;
}

export function getActivityCountByDeal(dealId: string, opts?: { inLastDays?: number }): number {
  const db = getDb();
  let sql = "SELECT COUNT(*) as cnt FROM activities WHERE dealId = ?";
  const params: unknown[] = [dealId];
  if (opts?.inLastDays) {
    const cutoff = new Date(Date.now() - opts.inLastDays * 24 * 60 * 60 * 1000).toISOString();
    sql += " AND timestamp >= ?";
    params.push(cutoff);
  }
  return (db.prepare(sql).get(...params) as { cnt: number }).cnt;
}

export function getClosedDeals(): Deal[] {
  return getDb().prepare("SELECT * FROM deals WHERE stage IN ('closed-won', 'closed-lost') ORDER BY updatedAt DESC").all() as Deal[];
}

export function getWonDeals(): Deal[] {
  return getDb().prepare("SELECT * FROM deals WHERE stage = 'closed-won' ORDER BY updatedAt DESC").all() as Deal[];
}

export function getLostDeals(): Deal[] {
  return getDb().prepare("SELECT * FROM deals WHERE stage = 'closed-lost' ORDER BY updatedAt DESC").all() as Deal[];
}

// ===== DASHBOARD STATS =====

export function getDashboardStats() {
  const db = getDb();
  const activeDeals = getActiveDeals();
  const pipelineValue = getPipelineValue();
  const closingThisMonth = getDealsClosingThisMonth();
  const followUps = getContactsNeedingFollowUp();
  const weightedValue = getWeightedPipelineValue();
  const activeContacts = db.prepare("SELECT COUNT(*) as cnt FROM contacts WHERE status = 'active'").get() as { cnt: number };
  const pinnedDeals = db.prepare("SELECT * FROM deals WHERE priority = 'high' AND stage NOT IN ('closed-won','closed-lost') ORDER BY value DESC LIMIT 4").all() as Deal[];

  return {
    activeDealsCount: activeDeals.length,
    pipelineValue,
    closingThisMonthCount: closingThisMonth.length,
    closingThisMonthValue: closingThisMonth.reduce((s, d) => s + d.value, 0),
    activeContactsCount: activeContacts.cnt,
    followUpsNeededCount: followUps.length,
    weightedPipelineValue: weightedValue,
    pinnedDeals,
    unreadEmailCount: getUnreadEmailCount(),
    unreadSmsCount: getUnreadSmsCount(),
  };
}

// ===== INSERT FUNCTIONS =====

function nextId(prefix: string): string {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${prefix === "c" ? "contacts" : prefix === "d" ? "deals" : "activities"}`).get() as { cnt: number };
  return `${prefix}${row.cnt + 1}_${Date.now()}`;
}

export function insertContact(data: {
  firstName: string; lastName: string; email?: string; company: string;
  title?: string; phone?: string; status?: string; tags?: string[];
}): Contact {
  const db = getDb();
  const id = nextId("c");
  const now = new Date().toISOString();
  const contact = {
    id,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || "",
    company: data.company,
    title: data.title || "",
    phone: data.phone || "",
    avatar: "",
    status: data.status || "active",
    tags: JSON.stringify(data.tags || []),
    lastContactedAt: now,
    createdAt: now,
  };
  db.prepare(`
    INSERT INTO contacts (id, firstName, lastName, email, company, title, phone, avatar, status, tags, lastContactedAt, createdAt)
    VALUES (@id, @firstName, @lastName, @email, @company, @title, @phone, @avatar, @status, @tags, @lastContactedAt, @createdAt)
  `).run(contact);
  return { ...contact, tags: data.tags || [] } as unknown as Contact;
}

export function insertDeal(data: {
  name: string; contactId?: string; company: string; value: number;
  stage?: string; probability?: number; closeDate?: string;
  priority?: string;
}): Deal {
  const db = getDb();
  const id = nextId("d");
  const now = new Date().toISOString();
  const deal = {
    id,
    name: data.name,
    contactId: data.contactId || null,
    company: data.company,
    value: data.value || 0,
    stage: data.stage || "lead",
    probability: data.probability ?? 20,
    closeDate: data.closeDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    assignedTo: "You",
    priority: data.priority || "medium",
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`
    INSERT INTO deals (id, name, contactId, company, value, stage, probability, closeDate, assignedTo, priority, createdAt, updatedAt)
    VALUES (@id, @name, @contactId, @company, @value, @stage, @probability, @closeDate, @assignedTo, @priority, @createdAt, @updatedAt)
  `).run(deal);
  return deal as Deal;
}

export function insertActivity(data: {
  type: string; contactId: string; dealId?: string; description: string;
}): Activity {
  const db = getDb();
  const id = nextId("a");
  const activity = {
    id,
    type: data.type,
    contactId: data.contactId,
    dealId: data.dealId || null,
    description: data.description,
    timestamp: new Date().toISOString(),
    metadata: null,
  };
  db.prepare(`
    INSERT INTO activities (id, type, contactId, dealId, description, timestamp, metadata)
    VALUES (@id, @type, @contactId, @dealId, @description, @timestamp, @metadata)
  `).run(activity);
  return activity as unknown as Activity;
}

// ===== UPDATE FUNCTIONS =====

export function updateContact(id: string, updates: Partial<{
  firstName: string; lastName: string; email: string; company: string;
  title: string; phone: string; status: string; tags: string[];
}>): Contact | undefined {
  const db = getDb();
  const existing = getContact(id);
  if (!existing) return undefined;

  const fields: string[] = ["updatedAt = @updatedAt"];
  const params: Record<string, unknown> = { id, updatedAt: new Date().toISOString() };

  if (updates.firstName !== undefined) { fields.push("firstName = @firstName"); params.firstName = updates.firstName; }
  if (updates.lastName !== undefined) { fields.push("lastName = @lastName"); params.lastName = updates.lastName; }
  if (updates.email !== undefined) { fields.push("email = @email"); params.email = updates.email; }
  if (updates.company !== undefined) { fields.push("company = @company"); params.company = updates.company; }
  if (updates.title !== undefined) { fields.push("title = @title"); params.title = updates.title; }
  if (updates.phone !== undefined) { fields.push("phone = @phone"); params.phone = updates.phone; }
  if (updates.status !== undefined) { fields.push("status = @status"); params.status = updates.status; }
  if (updates.tags !== undefined) { fields.push("tags = @tags"); params.tags = JSON.stringify(updates.tags); }

  if (fields.length === 0) return existing;

  db.prepare(`UPDATE contacts SET ${fields.join(", ")} WHERE id = @id`).run(params);
  return getContact(id);
}

export function updateDeal(id: string, updates: Partial<{
  name: string; company: string; value: number; stage: string;
  probability: number; closeDate: string; priority: string; contactId: string;
}>): Deal | undefined {
  const db = getDb();
  const existing = getDeal(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const params: Record<string, unknown> = { id, updatedAt: new Date().toISOString() };
  fields.push("updatedAt = @updatedAt");

  if (updates.name !== undefined) { fields.push("name = @name"); params.name = updates.name; }
  if (updates.company !== undefined) { fields.push("company = @company"); params.company = updates.company; }
  if (updates.value !== undefined) { fields.push("value = @value"); params.value = updates.value; }
  if (updates.stage !== undefined) { fields.push("stage = @stage"); params.stage = updates.stage; }
  if (updates.probability !== undefined) { fields.push("probability = @probability"); params.probability = updates.probability; }
  if (updates.closeDate !== undefined) { fields.push("closeDate = @closeDate"); params.closeDate = updates.closeDate; }
  if (updates.priority !== undefined) { fields.push("priority = @priority"); params.priority = updates.priority; }
  if (updates.contactId !== undefined) { fields.push("contactId = @contactId"); params.contactId = updates.contactId; }

  db.prepare(`UPDATE deals SET ${fields.join(", ")} WHERE id = @id`).run(params);

  // Log all field changes as deal-update activities
  const changes: string[] = [];
  if (updates.stage && updates.stage !== existing.stage) {
    changes.push(`Stage: ${existing.stage} → ${updates.stage}`);
  }
  if (updates.value !== undefined && updates.value !== existing.value) {
    changes.push(`Value: $${existing.value.toLocaleString()} → $${updates.value.toLocaleString()}`);
  }
  if (updates.priority && updates.priority !== existing.priority) {
    changes.push(`Priority: ${existing.priority} → ${updates.priority}`);
  }
  if (updates.closeDate && updates.closeDate !== existing.closeDate) {
    changes.push(`Close date updated`);
  }
  if (updates.name && updates.name !== existing.name) {
    changes.push(`Name: "${existing.name}" → "${updates.name}"`);
  }

  if (changes.length > 0) {
    const deal = getDeal(id)!;
    insertActivity({
      type: "deal-update",
      contactId: deal.contactId,
      dealId: deal.id,
      description: changes.join("; "),
    });
  }

  return getDeal(id);
}

export function moveDealStage(dealId: string, newStage: PipelineStage): Deal | undefined {
  const stageProbability: Record<PipelineStage, number> = {
    lead: 20,
    qualified: 40,
    proposal: 60,
    negotiation: 80,
    "closed-won": 100,
    "closed-lost": 0,
  };
  return updateDeal(dealId, { stage: newStage, probability: stageProbability[newStage] });
}

// ===== DELETE FUNCTIONS =====

export function deleteContact(id: string): { success: boolean; error?: string } {
  const db = getDb();
  const existing = getContact(id);
  if (!existing) return { success: false, error: "Contact not found" };

  const deals = getDealsByContact(id);
  if (deals.length > 0) {
    return { success: false, error: `Cannot delete contact — they have ${deals.length} existing deal(s). Delete the deals first.` };
  }

  db.prepare("DELETE FROM activities WHERE contactId = ?").run(id);
  db.prepare("DELETE FROM contacts WHERE id = ?").run(id);
  return { success: true };
}

export function deleteDeal(id: string): { success: boolean; error?: string } {
  const db = getDb();
  const existing = getDeal(id);
  if (!existing) return { success: false, error: "Deal not found" };

  db.prepare("DELETE FROM activities WHERE dealId = ?").run(id);
  db.prepare("DELETE FROM deals WHERE id = ?").run(id);
  return { success: true };
}

export function deleteActivity(id: string): { success: boolean; error?: string } {
  const db = getDb();
  const row = db.prepare("SELECT id FROM activities WHERE id = ?").get(id);
  if (!row) return { success: false, error: "Activity not found" };

  db.prepare("DELETE FROM activities WHERE id = ?").run(id);
  return { success: true };
}

// ===== GLOBAL SEARCH =====

export interface SearchResult {
  type: "contact" | "deal" | "activity" | "task" | "email" | "sms";
  id: string;
  title: string;
  subtitle: string;
  entityId?: string;
}

export function searchAll(query: string, limit: number = 20): SearchResult[] {
  const db = getDb();
  const q = `%${query}%`;
  const results: SearchResult[] = [];

  // Search contacts
  const contacts = db.prepare(`
    SELECT id, firstName, lastName, company, email FROM contacts
    WHERE (firstName || ' ' || lastName) LIKE ? OR company LIKE ? OR email LIKE ?
    LIMIT ?
  `).all(q, q, q, 5) as { id: string; firstName: string; lastName: string; company: string; email: string }[];
  for (const c of contacts) {
    results.push({ type: "contact", id: c.id, title: `${c.firstName} ${c.lastName}`, subtitle: `${c.company} · ${c.email}`, entityId: c.id });
  }

  // Search deals
  const deals = db.prepare(`
    SELECT id, name, company, stage FROM deals
    WHERE name LIKE ? OR company LIKE ?
    LIMIT ?
  `).all(q, q, 5) as { id: string; name: string; company: string; stage: string }[];
  for (const d of deals) {
    results.push({ type: "deal", id: d.id, title: d.name, subtitle: `${d.company} · ${d.stage}`, entityId: d.id });
  }

  // Search activities
  const activities = db.prepare(`
    SELECT id, type, description FROM activities
    WHERE description LIKE ?
    LIMIT ?
  `).all(q, 5) as { id: string; type: string; description: string }[];
  for (const a of activities) {
    results.push({ type: "activity", id: a.id, title: a.description.slice(0, 80), subtitle: a.type });
  }

  // Search tasks
  const tasks = db.prepare(`
    SELECT id, title, description, status FROM tasks
    WHERE title LIKE ? OR description LIKE ?
    LIMIT ?
  `).all(q, q, 5) as { id: string; title: string; description: string; status: string }[];
  for (const t of tasks) {
    results.push({ type: "task", id: t.id, title: t.title, subtitle: t.status });
  }

  // Search emails
  const emails = db.prepare(`
    SELECT id, subject, fromAddress, bodyText FROM emails
    WHERE subject LIKE ? OR bodyText LIKE ? OR fromAddress LIKE ?
    LIMIT ?
  `).all(q, q, q, 5) as { id: string; subject: string; fromAddress: string; bodyText: string }[];
  for (const e of emails) {
    results.push({ type: "email", id: e.id, title: e.subject || "(no subject)", subtitle: e.fromAddress });
  }

  return results.slice(0, limit);
}

export function typeaheadSearch(query: string, type?: string): { id: string; label: string; type: string }[] {
  const db = getDb();
  const q = `%${query}%`;
  const results: { id: string; label: string; type: string }[] = [];

  if (!type || type === "contact") {
    const contacts = db.prepare(`
      SELECT id, firstName, lastName, company FROM contacts
      WHERE (firstName || ' ' || lastName) LIKE ? OR company LIKE ?
      LIMIT 5
    `).all(q, q) as { id: string; firstName: string; lastName: string; company: string }[];
    for (const c of contacts) {
      results.push({ id: c.id, label: `${c.firstName} ${c.lastName} (${c.company})`, type: "contact" });
    }
  }

  if (!type || type === "deal") {
    const deals = db.prepare(`
      SELECT id, name, company FROM deals WHERE name LIKE ? OR company LIKE ? LIMIT 5
    `).all(q, q) as { id: string; name: string; company: string }[];
    for (const d of deals) {
      results.push({ id: d.id, label: `${d.name} — ${d.company}`, type: "deal" });
    }
  }

  return results.slice(0, 5);
}

// ===== SCHEMA INTROSPECTION =====

export function getSchemaDescription(): string {
  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];

  const lines: string[] = [];
  for (const { name } of tables) {
    const columns = db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string; type: string; notnull: number; pk: number }[];
    const fks = db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as { from: string; table: string; to: string }[];

    const colDescs = columns.map((col) => {
      let desc = `${col.name} ${col.type || "TEXT"}`;
      if (col.pk) desc += " PK";
      const fk = fks.find((f) => f.from === col.name);
      if (fk) desc += ` FK→${fk.table}.${fk.to}`;
      return desc;
    });

    lines.push(`- ${name} (${colDescs.join(", ")})`);
  }
  return lines.join("\n");
}

// ===== CUSTOM QUERY (for LLM) =====

export function runCustomQuery(sql: string): Record<string, unknown>[] {
  // Safety: only allow SELECT statements
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith("SELECT")) {
    throw new Error("Only SELECT queries are allowed");
  }
  // Block dangerous keywords
  const blocked = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "ATTACH", "DETACH", "PRAGMA"];
  for (const kw of blocked) {
    if (trimmed.includes(kw)) {
      throw new Error(`Query contains blocked keyword: ${kw}`);
    }
  }

  const db = getDb();
  return db.prepare(sql).all() as Record<string, unknown>[];
}

// ===== SETTINGS =====

export function getSetting(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  getDb().prepare(`
    INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
  `).run(key, value, new Date().toISOString());
}

export function getSettings(keys: string[]): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  const placeholders = keys.map(() => "?").join(",");
  const rows = getDb().prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`).all(...keys) as { key: string; value: string }[];
  for (const key of keys) {
    const row = rows.find(r => r.key === key);
    result[key] = row?.value;
  }
  return result;
}

export function deleteSetting(key: string): void {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

// ===== EMAIL QUERIES =====

export interface EmailRow {
  id: string;
  gmailMessageId: string;
  gmailThreadId: string;
  contactId: string | null;
  direction: "inbound" | "outbound";
  fromAddress: string;
  toAddress: string;
  ccAddress: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  isRead: number;
  labels: string;
  sentAt: string;
  syncedAt: string;
  source: "gmail" | "outlook";
  outlookMessageId: string | null;
  outlookConversationId: string | null;
}

export function upsertEmail(data: Omit<EmailRow, "id"> & { id?: string }): EmailRow {
  const db = getDb();
  const id = data.id || `e${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  db.prepare(`
    INSERT INTO emails (id, gmailMessageId, gmailThreadId, contactId, direction, fromAddress, toAddress, ccAddress, subject, bodyHtml, bodyText, isRead, labels, sentAt, syncedAt)
    VALUES (@id, @gmailMessageId, @gmailThreadId, @contactId, @direction, @fromAddress, @toAddress, @ccAddress, @subject, @bodyHtml, @bodyText, @isRead, @labels, @sentAt, @syncedAt)
    ON CONFLICT(gmailMessageId) DO UPDATE SET
      isRead = excluded.isRead,
      labels = excluded.labels,
      syncedAt = excluded.syncedAt,
      contactId = COALESCE(excluded.contactId, emails.contactId)
  `).run({ ...data, id, contactId: data.contactId || null });

  return db.prepare("SELECT * FROM emails WHERE id = ? OR gmailMessageId = ?").get(id, data.gmailMessageId) as EmailRow;
}

export function getEmails(opts: { contactId?: string; unreadOnly?: boolean; page?: number; pageSize?: number }): { emails: EmailRow[]; totalCount: number; unreadCount: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.contactId) {
    conditions.push("contactId = ?");
    params.push(opts.contactId);
  }
  if (opts.unreadOnly) {
    conditions.push("isRead = 0");
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const page = opts.page || 1;
  const pageSize = opts.pageSize || 15;
  const offset = (page - 1) * pageSize;

  const totalCount = (db.prepare(`SELECT COUNT(*) as cnt FROM emails ${where}`).get(...params) as { cnt: number }).cnt;
  const unreadCount = (db.prepare(`SELECT COUNT(*) as cnt FROM emails ${where ? where + " AND" : "WHERE"} isRead = 0`).get(...params) as { cnt: number }).cnt;
  const emails = db.prepare(`SELECT * FROM emails ${where} ORDER BY sentAt DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as EmailRow[];

  return { emails, totalCount, unreadCount };
}

export function getEmailByGmailId(gmailMessageId: string): EmailRow | undefined {
  return getDb().prepare("SELECT * FROM emails WHERE gmailMessageId = ?").get(gmailMessageId) as EmailRow | undefined;
}

export function getEmailThread(gmailThreadId: string): EmailRow[] {
  return getDb().prepare("SELECT * FROM emails WHERE gmailThreadId = ? ORDER BY sentAt ASC").all(gmailThreadId) as EmailRow[];
}

export function markEmailRead(id: string): void {
  getDb().prepare("UPDATE emails SET isRead = 1 WHERE id = ?").run(id);
}

export function getUnreadEmailCount(): number {
  return (getDb().prepare("SELECT COUNT(*) as cnt FROM emails WHERE isRead = 0 AND direction = 'inbound'").get() as { cnt: number }).cnt;
}

// ===== OUTLOOK EMAIL QUERIES =====

export function upsertOutlookEmail(data: Omit<EmailRow, "id" | "gmailMessageId" | "gmailThreadId"> & { id?: string }): EmailRow {
  const db = getDb();
  const id = data.id || `e${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  db.prepare(`
    INSERT INTO emails (id, gmailMessageId, gmailThreadId, contactId, direction, fromAddress, toAddress, ccAddress, subject, bodyHtml, bodyText, isRead, labels, sentAt, syncedAt, source, outlookMessageId, outlookConversationId)
    VALUES (@id, '', '', @contactId, @direction, @fromAddress, @toAddress, @ccAddress, @subject, @bodyHtml, @bodyText, @isRead, @labels, @sentAt, @syncedAt, 'outlook', @outlookMessageId, @outlookConversationId)
    ON CONFLICT(outlookMessageId) DO UPDATE SET
      isRead = excluded.isRead,
      labels = excluded.labels,
      syncedAt = excluded.syncedAt,
      contactId = COALESCE(excluded.contactId, emails.contactId)
  `).run({ ...data, id, contactId: data.contactId || null, outlookMessageId: data.outlookMessageId || null, outlookConversationId: data.outlookConversationId || null });

  return db.prepare("SELECT * FROM emails WHERE id = ? OR outlookMessageId = ?").get(id, data.outlookMessageId) as EmailRow;
}

export function getEmailByOutlookId(outlookMessageId: string): EmailRow | undefined {
  return getDb().prepare("SELECT * FROM emails WHERE outlookMessageId = ?").get(outlookMessageId) as EmailRow | undefined;
}

export function getOutlookEmailThread(conversationId: string): EmailRow[] {
  return getDb().prepare("SELECT * FROM emails WHERE outlookConversationId = ? ORDER BY sentAt ASC").all(conversationId) as EmailRow[];
}

export function getOutlookEmails(opts: { contactId?: string; unreadOnly?: boolean; page?: number; pageSize?: number }): { emails: EmailRow[]; totalCount: number; unreadCount: number } {
  const db = getDb();
  const conditions: string[] = ["source = 'outlook'"];
  const params: unknown[] = [];

  if (opts.contactId) {
    conditions.push("contactId = ?");
    params.push(opts.contactId);
  }
  if (opts.unreadOnly) {
    conditions.push("isRead = 0");
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const page = opts.page || 1;
  const pageSize = opts.pageSize || 15;
  const offset = (page - 1) * pageSize;

  const totalCount = (db.prepare(`SELECT COUNT(*) as cnt FROM emails ${where}`).get(...params) as { cnt: number }).cnt;
  const unreadCount = (db.prepare(`SELECT COUNT(*) as cnt FROM emails ${where} AND isRead = 0`).get(...params) as { cnt: number }).cnt;
  const emails = db.prepare(`SELECT * FROM emails ${where} ORDER BY sentAt DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as EmailRow[];

  return { emails, totalCount, unreadCount };
}

// ===== SMS QUERIES =====

export interface SmsRow {
  id: string;
  providerMessageId: string | null;
  contactId: string | null;
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  body: string;
  status: string;
  sentAt: string;
}

export function insertSmsMessage(data: Omit<SmsRow, "id"> & { id?: string }): SmsRow {
  const db = getDb();
  const id = data.id || `sms${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  db.prepare(`
    INSERT INTO sms_messages (id, providerMessageId, contactId, direction, fromNumber, toNumber, body, status, sentAt)
    VALUES (@id, @providerMessageId, @contactId, @direction, @fromNumber, @toNumber, @body, @status, @sentAt)
  `).run({ ...data, id, providerMessageId: data.providerMessageId || null, contactId: data.contactId || null });

  return db.prepare("SELECT * FROM sms_messages WHERE id = ?").get(id) as SmsRow;
}

export function getSmsByContact(contactId: string, opts?: { page?: number; pageSize?: number }): { messages: SmsRow[]; totalCount: number } {
  const db = getDb();
  const page = opts?.page || 1;
  const pageSize = opts?.pageSize || 50;
  const offset = (page - 1) * pageSize;

  const totalCount = (db.prepare("SELECT COUNT(*) as cnt FROM sms_messages WHERE contactId = ?").get(contactId) as { cnt: number }).cnt;
  const messages = db.prepare("SELECT * FROM sms_messages WHERE contactId = ? ORDER BY sentAt ASC LIMIT ? OFFSET ?").all(contactId, pageSize, offset) as SmsRow[];

  return { messages, totalCount };
}

export function getUnreadSmsCount(): number {
  // Count inbound SMS that haven't been "read" — for now count all recent inbound
  return (getDb().prepare("SELECT COUNT(*) as cnt FROM sms_messages WHERE direction = 'inbound'").get() as { cnt: number }).cnt;
}

// ===== ATTACHMENT QUERIES =====

export interface AttachmentRow {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  contactId: string | null;
  dealId: string | null;
  description: string | null;
  uploadedAt: string;
}

export function insertAttachment(data: {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  contactId?: string;
  dealId?: string;
  description?: string;
}): AttachmentRow {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO attachments (id, filename, originalName, mimeType, size, url, contactId, dealId, description, uploadedAt)
    VALUES (@id, @filename, @originalName, @mimeType, @size, @url, @contactId, @dealId, @description, @uploadedAt)
  `).run({
    ...data,
    contactId: data.contactId || null,
    dealId: data.dealId || null,
    description: data.description || null,
    uploadedAt: now,
  });
  return db.prepare("SELECT * FROM attachments WHERE id = ?").get(data.id) as AttachmentRow;
}

export function linkAttachment(id: string, updates: { contactId?: string; dealId?: string; description?: string }): AttachmentRow | undefined {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  if (updates.contactId !== undefined) { sets.push("contactId = ?"); params.push(updates.contactId || null); }
  if (updates.dealId !== undefined) { sets.push("dealId = ?"); params.push(updates.dealId || null); }
  if (updates.description !== undefined) { sets.push("description = ?"); params.push(updates.description || null); }
  if (sets.length === 0) return getAttachment(id);
  params.push(id);
  db.prepare(`UPDATE attachments SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  return db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as AttachmentRow | undefined;
}

export function getAttachment(id: string): AttachmentRow | undefined {
  return getDb().prepare("SELECT * FROM attachments WHERE id = ?").get(id) as AttachmentRow | undefined;
}

export function getAttachmentsByContact(contactId: string): AttachmentRow[] {
  return getDb().prepare("SELECT * FROM attachments WHERE contactId = ? ORDER BY uploadedAt DESC").all(contactId) as AttachmentRow[];
}

export function getAttachmentsByDeal(dealId: string): AttachmentRow[] {
  return getDb().prepare("SELECT * FROM attachments WHERE dealId = ? ORDER BY uploadedAt DESC").all(dealId) as AttachmentRow[];
}

// ===== TASK QUERIES =====

function enrichTask(row: Record<string, unknown>): Task {
  const task = row as unknown as Task;
  if (task.contactId) {
    const contact = getContact(task.contactId);
    if (contact) task.contactName = `${contact.firstName} ${contact.lastName}`;
  }
  if (task.dealId) {
    const deal = getDeal(task.dealId);
    if (deal) task.dealName = deal.name;
  }
  return task;
}

export function getTasks(opts?: {
  status?: string; dueDate?: string; contactId?: string;
  dealId?: string; includeOverdue?: boolean; limit?: number;
}): Task[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.status) { conditions.push("status = ?"); params.push(opts.status); }
  if (opts?.contactId) { conditions.push("contactId = ?"); params.push(opts.contactId); }
  if (opts?.dealId) { conditions.push("dealId = ?"); params.push(opts.dealId); }
  if (opts?.dueDate) { conditions.push("dueDate = ?"); params.push(opts.dueDate); }
  if (opts?.includeOverdue) {
    const today = new Date().toISOString().split("T")[0];
    conditions.push("(dueDate <= ? AND status = 'pending')");
    params.push(today);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts?.limit || 50;
  return db.prepare(`SELECT * FROM tasks ${where} ORDER BY dueDate ASC, priority ASC LIMIT ?`).all(...params, limit).map(r => enrichTask(r as Record<string, unknown>));
}

export function getTask(id: string): Task | undefined {
  const row = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? enrichTask(row) : undefined;
}

export function getOverdueTasks(): Task[] {
  const today = new Date().toISOString().split("T")[0];
  return getDb().prepare("SELECT * FROM tasks WHERE dueDate < ? AND status = 'pending' ORDER BY dueDate ASC").all(today).map(r => enrichTask(r as Record<string, unknown>));
}

export function getTasksDueToday(): Task[] {
  const today = new Date().toISOString().split("T")[0];
  return getDb().prepare("SELECT * FROM tasks WHERE dueDate = ? AND status = 'pending' ORDER BY priority ASC, dueTime ASC").all(today).map(r => enrichTask(r as Record<string, unknown>));
}

export function getUpcomingTasks(days: number = 7): Task[] {
  const today = new Date().toISOString().split("T")[0];
  const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return getDb().prepare("SELECT * FROM tasks WHERE dueDate > ? AND dueDate <= ? AND status = 'pending' ORDER BY dueDate ASC").all(today, future).map(r => enrichTask(r as Record<string, unknown>));
}

export function insertTask(data: {
  title: string; description?: string; dueDate: string; dueTime?: string;
  priority?: string; contactId?: string; dealId?: string; reminderMinutes?: number;
}): Task {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as cnt FROM tasks").get() as { cnt: number }).cnt;
  const id = `t${count + 1}_${Date.now()}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks (id, title, description, dueDate, dueTime, status, priority, contactId, dealId, reminderMinutes, createdAt, updatedAt)
    VALUES (@id, @title, @description, @dueDate, @dueTime, 'pending', @priority, @contactId, @dealId, @reminderMinutes, @createdAt, @updatedAt)
  `).run({
    id,
    title: data.title,
    description: data.description || "",
    dueDate: data.dueDate,
    dueTime: data.dueTime || null,
    priority: data.priority || "medium",
    contactId: data.contactId || null,
    dealId: data.dealId || null,
    reminderMinutes: data.reminderMinutes ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return getTask(id)!;
}

export function updateTask(id: string, updates: Partial<{
  title: string; description: string; dueDate: string; dueTime: string | null;
  status: string; priority: string; contactId: string | null; dealId: string | null;
}>): Task | undefined {
  const db = getDb();
  const existing = getTask(id);
  if (!existing) return undefined;

  const fields: string[] = ["updatedAt = @updatedAt"];
  const params: Record<string, unknown> = { id, updatedAt: new Date().toISOString() };

  if (updates.title !== undefined) { fields.push("title = @title"); params.title = updates.title; }
  if (updates.description !== undefined) { fields.push("description = @description"); params.description = updates.description; }
  if (updates.dueDate !== undefined) { fields.push("dueDate = @dueDate"); params.dueDate = updates.dueDate; }
  if (updates.dueTime !== undefined) { fields.push("dueTime = @dueTime"); params.dueTime = updates.dueTime; }
  if (updates.priority !== undefined) { fields.push("priority = @priority"); params.priority = updates.priority; }
  if (updates.contactId !== undefined) { fields.push("contactId = @contactId"); params.contactId = updates.contactId; }
  if (updates.dealId !== undefined) { fields.push("dealId = @dealId"); params.dealId = updates.dealId; }
  if (updates.status !== undefined) {
    fields.push("status = @status");
    params.status = updates.status;
    if (updates.status === "completed") {
      fields.push("completedAt = @completedAt");
      params.completedAt = new Date().toISOString();
    }
  }

  db.prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = @id`).run(params);
  return getTask(id);
}

export function completeTask(id: string): Task | undefined {
  return updateTask(id, { status: "completed" });
}

export function deleteTask(id: string): { success: boolean; error?: string } {
  const db = getDb();
  const existing = getTask(id);
  if (!existing) return { success: false, error: "Task not found" };
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return { success: true };
}

export function getTasksDueForReminder(): Task[] {
  const db = getDb();
  const now = new Date();

  const tasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'pending'
      AND reminderMinutes IS NOT NULL
      AND reminderFiredAt IS NULL
      AND dueDate IS NOT NULL
  `).all() as (Task & { reminderMinutes: number })[];

  return tasks.filter(task => {
    const dueDateTime = new Date(`${task.dueDate}T${task.dueTime || "09:00"}:00`);
    const reminderTime = new Date(dueDateTime.getTime() - (task.reminderMinutes || 0) * 60 * 1000);
    return now >= reminderTime;
  });
}

export function markReminderFired(taskId: string): void {
  getDb().prepare("UPDATE tasks SET reminderFiredAt = ? WHERE id = ?").run(new Date().toISOString(), taskId);
}

export function getTaskStats() {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];
  const overdue = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE dueDate < ? AND status = 'pending'").get(today) as { cnt: number }).cnt;
  const dueToday = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE dueDate = ? AND status = 'pending'").get(today) as { cnt: number }).cnt;
  const pending = (db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE status = 'pending'").get() as { cnt: number }).cnt;
  return { overdueCount: overdue, dueTodayCount: dueToday, pendingCount: pending };
}

// ===== CONVERSATION QUERIES =====

export interface ConversationRow {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessageRow {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  richBlocks: string;
  suggestedChips: string;
  attachments: string;
  debugToolCalls: string;
  timestamp: string;
}

export function createConversation(title?: string): ConversationRow {
  const db = getDb();
  const id = `conv_${Date.now()}`;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO conversations (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?)").run(id, title || "New conversation", now, now);
  return { id, title: title || "New conversation", createdAt: now, updatedAt: now };
}

export function getConversations(limit: number = 20): ConversationRow[] {
  return getDb().prepare("SELECT * FROM conversations ORDER BY updatedAt DESC LIMIT ?").all(limit) as ConversationRow[];
}

export function getConversation(id: string): ConversationRow | undefined {
  return getDb().prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow | undefined;
}

export function getConversationMessages(conversationId: string): ConversationMessageRow[] {
  return getDb().prepare("SELECT * FROM conversation_messages WHERE conversationId = ? ORDER BY timestamp ASC").all(conversationId) as ConversationMessageRow[];
}

export function addConversationMessage(data: {
  conversationId: string;
  id: string;
  role: "user" | "assistant";
  content: string;
  richBlocks?: unknown[];
  suggestedChips?: unknown[];
  attachments?: unknown[];
  debugToolCalls?: unknown[];
  timestamp: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO conversation_messages (id, conversationId, role, content, richBlocks, suggestedChips, attachments, debugToolCalls, timestamp)
    VALUES (@id, @conversationId, @role, @content, @richBlocks, @suggestedChips, @attachments, @debugToolCalls, @timestamp)
  `).run({
    id: data.id,
    conversationId: data.conversationId,
    role: data.role,
    content: data.content,
    richBlocks: JSON.stringify(data.richBlocks || []),
    suggestedChips: JSON.stringify(data.suggestedChips || []),
    attachments: JSON.stringify(data.attachments || []),
    debugToolCalls: JSON.stringify(data.debugToolCalls || []),
    timestamp: data.timestamp,
  });
  // Update conversation's updatedAt
  db.prepare("UPDATE conversations SET updatedAt = ? WHERE id = ?").run(data.timestamp, data.conversationId);
}

export function updateConversationTitle(id: string, title: string): void {
  getDb().prepare("UPDATE conversations SET title = ?, updatedAt = ? WHERE id = ?").run(title, new Date().toISOString(), id);
}

export function deleteConversation(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM conversation_messages WHERE conversationId = ?").run(id);
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
}

// ===== CALENDAR EVENT QUERIES =====

export interface CalendarEventRow {
  id: string;
  outlookEventId: string;
  subject: string;
  bodyPreview: string;
  startTime: string;
  endTime: string;
  location: string;
  isAllDay: number;
  organizerEmail: string;
  organizerName: string;
  attendees: string;
  contactId: string | null;
  dealId: string | null;
  webLink: string;
  syncedAt: string;
}

export function upsertCalendarEvent(data: Omit<CalendarEventRow, "id"> & { id?: string }): CalendarEventRow {
  const db = getDb();
  const id = data.id || `cal${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  db.prepare(`
    INSERT INTO calendar_events (id, outlookEventId, subject, bodyPreview, startTime, endTime, location, isAllDay, organizerEmail, organizerName, attendees, contactId, dealId, webLink, syncedAt)
    VALUES (@id, @outlookEventId, @subject, @bodyPreview, @startTime, @endTime, @location, @isAllDay, @organizerEmail, @organizerName, @attendees, @contactId, @dealId, @webLink, @syncedAt)
    ON CONFLICT(outlookEventId) DO UPDATE SET
      subject = excluded.subject,
      bodyPreview = excluded.bodyPreview,
      startTime = excluded.startTime,
      endTime = excluded.endTime,
      location = excluded.location,
      isAllDay = excluded.isAllDay,
      attendees = excluded.attendees,
      syncedAt = excluded.syncedAt
  `).run({ ...data, id, contactId: data.contactId || null, dealId: data.dealId || null });

  return db.prepare("SELECT * FROM calendar_events WHERE id = ? OR outlookEventId = ?").get(id, data.outlookEventId) as CalendarEventRow;
}

export function getCalendarEvents(opts: { startDate?: string; endDate?: string; contactId?: string }): CalendarEventRow[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.startDate) {
    conditions.push("startTime >= ?");
    params.push(opts.startDate);
  }
  if (opts.endDate) {
    conditions.push("startTime <= ?");
    params.push(opts.endDate);
  }
  if (opts.contactId) {
    conditions.push("contactId = ?");
    params.push(opts.contactId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`SELECT * FROM calendar_events ${where} ORDER BY startTime ASC`).all(...params) as CalendarEventRow[];
}

export function getCalendarEventByOutlookId(outlookEventId: string): CalendarEventRow | undefined {
  return getDb().prepare("SELECT * FROM calendar_events WHERE outlookEventId = ?").get(outlookEventId) as CalendarEventRow | undefined;
}

// ===== EMAIL TEMPLATE QUERIES =====

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  mergeFields: string;
  createdAt: string;
  updatedAt: string;
}

export function insertEmailTemplate(data: { name: string; subject: string; bodyHtml: string; bodyText: string; mergeFields?: string[] }): EmailTemplate {
  const db = getDb();
  const id = `tmpl${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO email_templates (id, name, subject, bodyHtml, bodyText, mergeFields, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.subject, data.bodyHtml, data.bodyText, JSON.stringify(data.mergeFields || []), now, now);
  return db.prepare("SELECT * FROM email_templates WHERE id = ?").get(id) as EmailTemplate;
}

export function getAllEmailTemplates(): EmailTemplate[] {
  return getDb().prepare("SELECT * FROM email_templates ORDER BY updatedAt DESC").all() as EmailTemplate[];
}

export function getEmailTemplate(id: string): EmailTemplate | undefined {
  return getDb().prepare("SELECT * FROM email_templates WHERE id = ?").get(id) as EmailTemplate | undefined;
}

export function deleteEmailTemplate(id: string): void {
  getDb().prepare("DELETE FROM email_templates WHERE id = ?").run(id);
}

// ===== SCHEDULED MESSAGE QUERIES =====

export interface ScheduledMessage {
  id: string;
  type: "email" | "sms";
  provider: "gmail" | "outlook" | "twilio";
  contactId: string | null;
  recipientAddress: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  scheduledAt: string;
  sentAt: string | null;
  status: "pending" | "sent" | "failed" | "cancelled";
  createdAt: string;
}

export function insertScheduledMessage(data: {
  type: "email" | "sms";
  provider: "gmail" | "outlook" | "twilio";
  contactId?: string;
  recipientAddress: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  scheduledAt: string;
}): ScheduledMessage {
  const db = getDb();
  const id = `sched${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO scheduled_messages (id, type, provider, contactId, recipientAddress, subject, bodyHtml, bodyText, scheduledAt, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, data.type, data.provider, data.contactId || null, data.recipientAddress, data.subject || "", data.bodyHtml || "", data.bodyText || "", data.scheduledAt, now);
  return db.prepare("SELECT * FROM scheduled_messages WHERE id = ?").get(id) as ScheduledMessage;
}

export function getPendingScheduledMessages(): ScheduledMessage[] {
  const now = new Date().toISOString();
  return getDb().prepare(
    "SELECT * FROM scheduled_messages WHERE status = 'pending' AND scheduledAt <= ? ORDER BY scheduledAt ASC"
  ).all(now) as ScheduledMessage[];
}

export function getScheduledMessages(opts?: { status?: string; contactId?: string }): ScheduledMessage[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts?.status) { conditions.push("status = ?"); params.push(opts.status); }
  if (opts?.contactId) { conditions.push("contactId = ?"); params.push(opts.contactId); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return getDb().prepare(`SELECT * FROM scheduled_messages ${where} ORDER BY scheduledAt DESC`).all(...params) as ScheduledMessage[];
}

export function updateScheduledMessageStatus(id: string, status: "sent" | "failed" | "cancelled", sentAt?: string): void {
  getDb().prepare("UPDATE scheduled_messages SET status = ?, sentAt = ? WHERE id = ?").run(status, sentAt || null, id);
}

// ===== PIPELINE SNAPSHOT QUERIES =====

export interface PipelineSnapshot {
  id: string;
  date: string;
  stage: string;
  dealCount: number;
  totalValue: number;
  weightedValue: number;
}

export function capturePipelineSnapshot(date: string): PipelineSnapshot[] {
  const db = getDb();
  const existing = db.prepare("SELECT COUNT(*) as cnt FROM pipeline_snapshots WHERE date = ?").get(date) as { cnt: number };
  if (existing.cnt > 0) {
    return db.prepare("SELECT * FROM pipeline_snapshots WHERE date = ? ORDER BY stage").all(date) as PipelineSnapshot[];
  }

  const stages: PipelineStage[] = ["lead", "qualified", "proposal", "negotiation", "closed-won", "closed-lost"];
  const results: PipelineSnapshot[] = [];

  for (const stage of stages) {
    const deals = getDealsByStage(stage);
    const totalValue = deals.reduce((s, d) => s + d.value, 0);
    const weightedValue = deals.reduce((s, d) => s + d.value * d.probability / 100, 0);
    const id = `snap${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    db.prepare(`
      INSERT INTO pipeline_snapshots (id, date, stage, dealCount, totalValue, weightedValue)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, date, stage, deals.length, totalValue, weightedValue);

    results.push({ id, date, stage, dealCount: deals.length, totalValue, weightedValue });
  }

  return results;
}

export function getPipelineSnapshots(opts?: { startDate?: string; endDate?: string }): PipelineSnapshot[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.startDate) { conditions.push("date >= ?"); params.push(opts.startDate); }
  if (opts?.endDate) { conditions.push("date <= ?"); params.push(opts.endDate); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`SELECT * FROM pipeline_snapshots ${where} ORDER BY date ASC, stage ASC`).all(...params) as PipelineSnapshot[];
}

// ===== TIME-RANGE QUERIES FOR ANALYTICS =====

export function getActivitiesByDateRange(startDate: string, endDate: string): Activity[] {
  return getDb().prepare(
    "SELECT * FROM activities WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC"
  ).all(startDate, endDate) as Activity[];
}

export function getActivityCountsByTypeInRange(startDate: string, endDate: string): Record<string, number> {
  const rows = getDb().prepare(
    "SELECT type, COUNT(*) as cnt FROM activities WHERE timestamp >= ? AND timestamp <= ? GROUP BY type"
  ).all(startDate, endDate) as { type: string; cnt: number }[];
  const result: Record<string, number> = {};
  for (const row of rows) result[row.type] = row.cnt;
  return result;
}

export function getDealsClosedInRange(startDate: string, endDate: string): Deal[] {
  return getDb().prepare(
    "SELECT * FROM deals WHERE stage IN ('closed-won', 'closed-lost') AND updatedAt >= ? AND updatedAt <= ? ORDER BY updatedAt DESC"
  ).all(startDate, endDate) as Deal[];
}
