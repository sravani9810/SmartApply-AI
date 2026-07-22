import { sql } from "drizzle-orm";
import type { JobPosting, JobSearchQuery } from "@smartapply/shared";
import { db } from "../db/client";
import * as s from "../db/schema";

export interface IngestResult {
  received: number;
  written: number;
}

/**
 * Upsert postings into the jobs table, deduped by id.
 *
 * On an existing job we refresh the descriptive fields and `lastSeenAt`, but
 * **preserve** `status`, `fitScore`, and `capturedAt` — those are owned by the
 * hub (your application tracking), not the scraper. `coalesce(excluded.x, x)`
 * keeps existing values when the incoming posting has a null.
 */
export function ingestPostings(postings: JobPosting[]): IngestResult {
  const now = new Date().toISOString();
  let written = 0;

  for (const p of postings) {
    if (!p.id) continue;
    db.insert(s.jobs)
      .values({
        id: p.id,
        title: p.title,
        company: p.company,
        location: p.location ?? null,
        source: p.source ?? "",
        url: p.url ?? "",
        datePosted: p.datePosted ?? null,
        endDate: p.endDate ?? null,
        description: p.description ?? null,
        recruiterName: p.recruiter?.name ?? null,
        recruiterEmail: p.recruiter?.email ?? null,
        recruiterPhone: p.recruiter?.phone ?? null,
        status: p.status ?? "new",
        capturedAt: p.capturedAt ?? now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: s.jobs.id,
        set: {
          title: sql`excluded.title`,
          company: sql`excluded.company`,
          location: sql`coalesce(excluded.location, ${s.jobs.location})`,
          source: sql`excluded.source`,
          url: sql`excluded.url`,
          datePosted: sql`coalesce(excluded.date_posted, ${s.jobs.datePosted})`,
          endDate: sql`coalesce(excluded.end_date, ${s.jobs.endDate})`,
          description: sql`coalesce(excluded.description, ${s.jobs.description})`,
          recruiterName: sql`coalesce(excluded.recruiter_name, ${s.jobs.recruiterName})`,
          recruiterEmail: sql`coalesce(excluded.recruiter_email, ${s.jobs.recruiterEmail})`,
          recruiterPhone: sql`coalesce(excluded.recruiter_phone, ${s.jobs.recruiterPhone})`,
          lastSeenAt: now,
          // status, fitScore, capturedAt intentionally NOT updated.
        },
      })
      .run();
    written++;
  }
  return { received: postings.length, written };
}

/**
 * Run the Part 1 pipeline (all active boards + recruiter enrichment) and
 * upsert the results into the hub DB. Reuses @smartapply/job-search wholesale —
 * it still writes its Excel/Sheets export as a side effect.
 *
 * @param queries Optional search overrides (keywords/location) from the hub UI.
 *   Omit to use the pipeline's env-configured searches.
 */
export async function runIngest(queries?: JobSearchQuery[]): Promise<IngestResult> {
  const { runJobSearch } = await import("@smartapply/job-search");
  const postings = await runJobSearch(queries);
  return ingestPostings(postings);
}
