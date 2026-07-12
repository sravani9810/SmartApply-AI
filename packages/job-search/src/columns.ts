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
    capturedAt: job.capturedAt,
  };
}

/** A flat row as a plain array in column order (for Sheets/CSV-style sinks). */
export function toRowArray(row: FlatRow): Array<string | number> {
  return COLUMNS.map((c) => row[c.key]);
}
