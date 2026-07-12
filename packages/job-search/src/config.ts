import type { JobSearchQuery } from "@smartapply/shared";

/**
 * Search configuration. In a real deployment this would be read from a file or
 * env; kept inline here so the pipeline runs out of the box on a local machine.
 */
export interface JobSearchConfig {
  query: JobSearchQuery;
  /** Path to the Excel workbook that tracks all discovered jobs. */
  workbookPath: string;
}

export const config: JobSearchConfig = {
  query: {
    keywords: ["software engineer", "typescript"],
    location: "Remote",
    postedWithinDays: 7,
  },
  workbookPath: "data/jobs.xlsx",
};
