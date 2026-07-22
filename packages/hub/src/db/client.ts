import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

/**
 * SQLite lives at packages/hub/data/smartapply.db. Anchor on the working
 * directory (the package root) rather than this file — under `next` this module
 * is bundled and `import.meta.url` would point into `.next`, opening the wrong
 * DB. `next dev` and the `tsx` scripts both run with cwd = packages/hub.
 */
export const DB_PATH =
  process.env.SMARTAPPLY_DB_PATH ?? join(process.cwd(), "data", "smartapply.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
