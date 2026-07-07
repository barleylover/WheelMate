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
}
