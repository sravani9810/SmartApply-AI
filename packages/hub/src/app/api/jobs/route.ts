import type { JobsExport } from "@smartapply/shared";
import { db } from "../../../db/client";
import * as s from "../../../db/schema";
import { sql } from "drizzle-orm";
import { corsJson, preflight } from "../../../lib/http";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** GET /api/jobs — jobs-export.json shape for the autofill extension. */
export function GET() {
  const rows = db.select({
    id: s.jobs.id, title: s.jobs.title, company: s.jobs.company,
    location: s.jobs.location, source: s.jobs.source, url: s.jobs.url, status: s.jobs.status,
  }).from(s.jobs).orderBy(sql`${s.jobs.capturedAt} desc`).all();

  const payload: JobsExport = {
    exportedAt: new Date().toISOString(),
    jobs: rows.map((j) => ({
      id: j.id, title: j.title, company: j.company,
      location: j.location ?? undefined, source: j.source, url: j.url,
      status: (j.status as JobsExport["jobs"][number]["status"]) ?? "new",
    })),
  };
  return corsJson(payload);
}
