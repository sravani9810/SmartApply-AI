import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, DB_PATH } from "./client";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, "..", "..", "drizzle");

console.log(`[migrate] applying migrations from ${migrationsFolder}`);
migrate(db, { migrationsFolder });
console.log(`[migrate] done → ${DB_PATH}`);
