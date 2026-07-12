import type { JobSearchQuery } from "@smartapply/shared";

/**
 * Search configuration. Read from environment variables (see .env / .env.example)
 * so the user can change the job title, location, and recency without editing
 * code. Sensible defaults apply when a variable is unset.
 */
export interface JobSearchConfig {
  query: JobSearchQuery;
  /** Path to the Excel workbook that tracks all discovered jobs. */
  workbookPath: string;
}

/**
 * Build the config from env at call time. It must be a function (not a const)
 * so it reads process.env *after* dotenv has loaded — ESM evaluates imports
 * before the dotenv call in index.ts runs.
 *
 * Env:
 *   JOB_KEYWORDS            comma-separated, e.g. "software engineer, typescript"
 *   JOB_LOCATION            e.g. "Remote" or "Bengaluru, India"
 *   JOB_POSTED_WITHIN_DAYS  only jobs posted within N days (Indeed "fromage")
 *   JOBS_WORKBOOK_PATH      Excel output path (default data/jobs.xlsx)
 */
export function getConfig(): JobSearchConfig {
  const keywords = (process.env.JOB_KEYWORDS ?? "software engineer, typescript")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const postedWithinDays = process.env.JOB_POSTED_WITHIN_DAYS
    ? Number(process.env.JOB_POSTED_WITHIN_DAYS)
    : 7;

  return {
    query: {
      keywords,
      location: process.env.JOB_LOCATION ?? "Remote",
      postedWithinDays: Number.isFinite(postedWithinDays) ? postedWithinDays : 7,
    },
    workbookPath: process.env.JOBS_WORKBOOK_PATH ?? "data/jobs.xlsx",
  };
}
