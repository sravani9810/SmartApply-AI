import type { JobPosting } from "@smartapply/shared";

/**
 * Single source of truth for the tabular schema used by every sink (Excel,
 * Google Sheets, …). Columns capture exactly what Part 1 must save: link, dates
 * (posted / end), and recruiter contact (email, phone), plus tracking fields.
 */
export const COLUMNS: Array<{ header: string; key: keyof FlatRow; width: number }> = [
  { header: "ID", key: "id", width: 18 },
  { header: "Title", key: "title", width: 30 },
  { header: "Company", key: "company", width: 24 },
  { header: "Location", key: "location", width: 18 },
  { header: "Source", key: "source", width: 14 },
  { header: "Link", key: "url", width: 40 },
  { header: "Date Posted", key: "datePosted", width: 14 },
  { header: "End Date", key: "endDate", width: 14 },
  { header: "Recruiter", key: "recruiterName", width: 20 },
  { header: "Recruiter Email", key: "recruiterEmail", width: 26 },
  { header: "Recruiter Phone", key: "recruiterPhone", width: 18 },
  { header: "Status", key: "status", width: 12 },
  { header: "Fit Score", key: "fitScore", width: 10 },
  { header: "Captured At", key: "capturedAt", width: 22 },
  { header: "Last Seen At", key: "lastSeenAt", width: 22 },
];

export interface FlatRow {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  url: string;
  datePosted: string;
  endDate: string;
  recruiterName: string;
  recruiterEmail: string;
  recruiterPhone: string;
  status: string;
  fitScore: number | "";
  capturedAt: string;
  lastSeenAt: string;
}

/** Header labels in column order. */
export const HEADERS: string[] = COLUMNS.map((c) => c.header);

/** Flatten a JobPosting into the flat row shape (empty string for absent). */
export function flatten(job: JobPosting): FlatRow {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location ?? "",
    source: job.source,
    url: job.url,
    datePosted: job.datePosted ?? "",
    endDate: job.endDate ?? "",
    recruiterName: job.recruiter?.name ?? "",
    recruiterEmail: job.recruiter?.email ?? "",
    recruiterPhone: job.recruiter?.phone ?? "",
    status: job.status ?? "new",
    fitScore: job.fitScore ?? "",
    capturedAt: job.capturedAt, // first-seen (preserved on update)
    lastSeenAt: job.capturedAt, // this run's fetch time (refreshed each run)
  };
}

/** A flat row as a plain array in column order (for Sheets/CSV-style sinks). */
export function toRowArray(row: FlatRow): Array<string | number> {
  return COLUMNS.map((c) => row[c.key]);
}

/** Parse a Sheets/CSV-style row array back into a partial flat row (by column order). */
export function rowArrayToPartial(
  values: Array<string | number | null | undefined>,
): Partial<FlatRow> {
  const p: Record<string, unknown> = {};
  COLUMNS.forEach((c, i) => {
    const v = values[i];
    if (v !== undefined && v !== null) p[c.key] = v;
  });
  return p as Partial<FlatRow>;
}

// Fields owned by the workflow/user (not the job board). On an existing row
// these are kept as-is so hourly re-fetches never clobber them.
const PRESERVE_ON_UPDATE: Array<keyof FlatRow> = ["status", "fitScore", "capturedAt"];
const RECRUITER_KEYS: Array<keyof FlatRow> = [
  "recruiterName",
  "recruiterEmail",
  "recruiterPhone",
];

/**
 * Merge a freshly fetched row over an existing one so re-fetching a known job
 * refreshes board-owned fields (title, company, link, dates) while preserving:
 *   - Status  — your manual application state
 *   - Fit Score — computed by the resume matcher
 *   - Captured At — first-seen timestamp
 *   - Recruiter details already filled in (kept when the new fetch has none)
 */
export function mergePreserving(
  incoming: FlatRow,
  existing: Partial<FlatRow>,
): FlatRow {
  const merged: Record<string, unknown> = { ...incoming };
  for (const k of PRESERVE_ON_UPDATE) {
    const ev = existing[k];
    if (ev !== undefined && ev !== "") merged[k] = ev;
  }
  for (const k of RECRUITER_KEYS) {
    if ((merged[k] === undefined || merged[k] === "") && existing[k]) {
      merged[k] = existing[k];
    }
  }
  return merged as unknown as FlatRow;
}
