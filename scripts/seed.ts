import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { contacts } from "../src/data/contacts";
import { deals } from "../src/data/deals";
import { activities } from "../src/data/activities";

const DB_PATH = path.join(process.cwd(), "data", "crm.db");

// Ensure data directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// Remove existing database
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log("Removed existing database");
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create tables
db.exec(`
  CREATE TABLE contacts (
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

  CREATE TABLE deals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contactId TEXT NOT NULL,
    company TEXT NOT NULL,
    value REAL NOT NULL,
    stage TEXT NOT NULL CHECK(stage IN ('lead','qualified','proposal','negotiation','closed-won','closed-lost')),
    probability REAL NOT NULL,
    closeDate TEXT NOT NULL,
    assignedTo TEXT NOT NULL,
    priority TEXT NOT NULL CHECK(priority IN ('high','medium','low')),
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (contactId) REFERENCES contacts(id)
  );

  CREATE TABLE activities (
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
`);

// Insert data
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
db.close();

console.log(`Seeded database at ${DB_PATH}`);
console.log(`  ${contacts.length} contacts`);
console.log(`  ${deals.length} deals`);
console.log(`  ${activities.length} activities`);
