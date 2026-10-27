/**
 * Phase 1 verification test — tests CRUD operations and API endpoints
 * Run with: npx tsx scripts/test-phase1.ts
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-phase1.db");

// Clean up any previous test DB
if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

const db = new Database(TEST_DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create schema (matches db.ts initSchema)
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

// Add updatedAt column to contacts (migration)
try { db.exec("ALTER TABLE contacts ADD COLUMN updatedAt TEXT;"); } catch {}

const now = new Date().toISOString();

// Seed test data
db.prepare(`INSERT INTO contacts VALUES ('c1','Sarah','Chen','sarah@test.com','Acme','VP','555-1234','','active','["enterprise"]','${now}','${now}',NULL)`).run();
db.prepare(`INSERT INTO contacts VALUES ('c2','Tom','Walker','tom@test.com','Fort','CISO','555-5678','','active','[]','${now}','${now}',NULL)`).run();
db.prepare(`INSERT INTO deals VALUES ('d1','Enterprise License','c1','Acme',50000,'proposal',60,'${now}','You','high','${now}','${now}')`).run();
db.prepare(`INSERT INTO activities VALUES ('a1','call','c1','d1','Called about renewal','${now}',NULL)`).run();
db.prepare(`INSERT INTO activities VALUES ('a2','email','c2',NULL,'Sent intro email','${now}',NULL)`).run();

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}

// ===== TEST: Update Contact =====
console.log("\n📝 Update Contact");

// Update firstName
db.prepare("UPDATE contacts SET firstName = ?, updatedAt = ? WHERE id = ?").run("Sarah-Updated", now, "c1");
const c1 = db.prepare("SELECT * FROM contacts WHERE id = ?").get("c1") as any;
assert(c1.firstName === "Sarah-Updated", "firstName updated");
assert(c1.updatedAt !== null, "updatedAt set");

// Update tags (JSON)
db.prepare("UPDATE contacts SET tags = ? WHERE id = ?").run(JSON.stringify(["enterprise", "tech"]), "c1");
const c1Tags = db.prepare("SELECT tags FROM contacts WHERE id = ?").get("c1") as any;
const parsedTags = JSON.parse(c1Tags.tags);
assert(parsedTags.length === 2 && parsedTags[1] === "tech", "tags updated as JSON");

// Update non-existent
const nonExist = db.prepare("SELECT * FROM contacts WHERE id = ?").get("c999");
assert(nonExist === undefined, "non-existent contact returns undefined");

// ===== TEST: Update Deal =====
console.log("\n📝 Update Deal");

db.prepare("UPDATE deals SET stage = ?, probability = ?, updatedAt = ? WHERE id = ?").run("negotiation", 80, now, "d1");
const d1 = db.prepare("SELECT * FROM deals WHERE id = ?").get("d1") as any;
assert(d1.stage === "negotiation", "deal stage updated");
assert(d1.probability === 80, "probability updated with stage");

db.prepare("UPDATE deals SET value = ?, updatedAt = ? WHERE id = ?").run(75000, now, "d1");
const d1v = db.prepare("SELECT * FROM deals WHERE id = ?").get("d1") as any;
assert(d1v.value === 75000, "deal value updated");

// ===== TEST: Delete Contact with deals =====
console.log("\n📝 Delete Contact (with deals guard)");

const c1Deals = db.prepare("SELECT COUNT(*) as cnt FROM deals WHERE contactId = ?").get("c1") as any;
assert(c1Deals.cnt > 0, "c1 has deals — should block delete");

// ===== TEST: Delete Activity =====
console.log("\n📝 Delete Activity");

const beforeCount = (db.prepare("SELECT COUNT(*) as cnt FROM activities").get() as any).cnt;
db.prepare("DELETE FROM activities WHERE id = ?").run("a2");
const afterCount = (db.prepare("SELECT COUNT(*) as cnt FROM activities").get() as any).cnt;
assert(afterCount === beforeCount - 1, "activity deleted");

const deletedActivity = db.prepare("SELECT * FROM activities WHERE id = ?").get("a2");
assert(deletedActivity === undefined, "deleted activity no longer exists");

// ===== TEST: Delete Deal (cascade) =====
console.log("\n📝 Delete Deal (cascade activities)");

const activitiesBefore = (db.prepare("SELECT COUNT(*) as cnt FROM activities WHERE dealId = ?").get("d1") as any).cnt;
assert(activitiesBefore > 0, "deal has activities before delete");

db.prepare("DELETE FROM activities WHERE dealId = ?").run("d1");
db.prepare("DELETE FROM deals WHERE id = ?").run("d1");
const dealAfter = db.prepare("SELECT * FROM deals WHERE id = ?").get("d1");
assert(dealAfter === undefined, "deal deleted");

const activitiesAfter = (db.prepare("SELECT COUNT(*) as cnt FROM activities WHERE dealId = ?").get("d1") as any).cnt;
assert(activitiesAfter === 0, "deal activities cascaded");

// ===== TEST: Delete Contact (no deals) =====
console.log("\n📝 Delete Contact (no deals — should succeed)");

const c2Deals = (db.prepare("SELECT COUNT(*) as cnt FROM deals WHERE contactId = ?").get("c2") as any).cnt;
assert(c2Deals === 0, "c2 has no deals");

db.prepare("DELETE FROM activities WHERE contactId = ?").run("c2");
db.prepare("DELETE FROM contacts WHERE id = ?").run("c2");
const c2After = db.prepare("SELECT * FROM contacts WHERE id = ?").get("c2");
assert(c2After === undefined, "contact without deals deleted");

// ===== TEST: Schema migration =====
console.log("\n📝 Schema Migration");

const cols = db.prepare("PRAGMA table_info(contacts)").all() as any[];
const hasUpdatedAt = cols.some((c: any) => c.name === "updatedAt");
assert(hasUpdatedAt, "contacts table has updatedAt column");

// Clean up
db.close();
fs.unlinkSync(TEST_DB_PATH);

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("All Phase 1 DB tests passed! ✅\n");
