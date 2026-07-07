import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "../config.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export function openDatabase(config: AppConfig): DatabaseSync {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  return new DatabaseSync(config.dbPath);
}

export function applySchema(db: DatabaseSync): void {
  const schemaPath = path.join(dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  db.exec(schema);
  migratePublicAccessibilityEvidence(db);
}

function migratePublicAccessibilityEvidence(db: DatabaseSync): void {
  const columns = db
    .prepare("PRAGMA table_info(public_accessibility_evidence)")
    .all()
    .map((row) => String((row as { name: unknown }).name));
  const missingColumns = [
    ["name", "TEXT"],
    ["address", "TEXT"],
    ["lat", "REAL"],
    ["lng", "REAL"]
  ].filter(([name]) => !columns.includes(name));
  for (const [name, type] of missingColumns) {
    db.exec(`ALTER TABLE public_accessibility_evidence ADD COLUMN ${name} ${type}`);
  }
}
