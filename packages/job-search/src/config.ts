import type { JobSearchQuery } from "@smartapply/shared";

/**
 * Search configuration. Read from environment variables (see .env / .env.example)
 * so the user can change the job title, location, and recency without editing
 * code. Sensible defaults apply when a variable is unset.
 */
export interface JobSearchConfig {
  /** One or more searches; all feed the same Excel/Sheet (deduped by id). */
  queries: JobSearchQuery[];
  /** Path to the Excel workbook that tracks all discovered jobs. */
  workbookPath: string;
}

/**
 * Build the config from env at call time. It must be a function (not a const)
 * so it reads process.env *after* dotenv has loaded — ESM evaluates imports
 * before the dotenv call in index.ts runs.
 *
 * Env:
 *   Single search:
 *     JOB_KEYWORDS            comma-separated, e.g. "software engineer, typescript"
 *     JOB_LOCATION            e.g. "Remote" or "Bengaluru, India"
 *   Multiple searches (takes precedence when set):
 *     JOB_SEARCHES            pipe-separated "keywords @ location" entries, e.g.
 *                             "software engineer @ Remote | data analyst @ Bengaluru, India"
 *   Common:
 *     JOB_POSTED_WITHIN_DAYS  only jobs posted within N days (Indeed "fromage")
 *     JOBS_WORKBOOK_PATH      Excel output path (default data/jobs.xlsx)
 */
export function getConfig(): JobSearchConfig {
  const postedWithinDaysRaw = process.env.JOB_POSTED_WITHIN_DAYS
    ? Number(process.env.JOB_POSTED_WITHIN_DAYS)
    : 7;
  const postedWithinDays = Number.isFinite(postedWithinDaysRaw)
    ? postedWithinDaysRaw
    : 7;

  const parseKeywords = (s: string) =>
    s.split(",").map((k) => k.trim()).filter(Boolean);

  let queries: JobSearchQuery[] = [];

  // Multiple searches: "keywords @ location | keywords @ location | ..."
  const multi = process.env.JOB_SEARCHES?.trim();
  if (multi) {
    queries = multi
      .split("|")
      .map((entry) => {
        const [kw, loc] = entry.split("@");
        return {
          keywords: parseKeywords(kw ?? ""),
          location: (loc ?? "").trim() || undefined,
          postedWithinDays,
        };
      })
      .filter((q) => q.keywords.length > 0);
  }

  // Fall back to the single-search vars (with defaults).
  if (queries.length === 0) {
    queries = [
      {
        keywords: parseKeywords(
          process.env.JOB_KEYWORDS ?? "software engineer, typescript",
        ),
        location: process.env.JOB_LOCATION ?? "Remote",
        postedWithinDays,
      },
    ];
  }

  return {
    queries,
    workbookPath: process.env.JOBS_WORKBOOK_PATH ?? "data/jobs.xlsx",
  };
}
