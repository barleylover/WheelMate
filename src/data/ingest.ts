import { config } from "../config.js";
import { applySchema, openDatabase } from "./db.js";
import { logger } from "../utils/logger.js";

const db = openDatabase(config);
try {
  applySchema(db);
  logger.info("sqlite_schema_ready", { dbPath: config.dbPath });
} finally {
  db.close();
}
