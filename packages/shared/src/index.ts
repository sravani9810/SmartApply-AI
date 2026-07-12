/**
 * Types shared across the three SmartApply parts:
 *   1. job-search        — discovers postings and logs them to Excel
 *   2. autofill-extension — fills & submits application forms in the browser
 *   3. resume-matcher    — scores/tailors a resume against a job description
 */

/** A recruiter contact discovered alongside a posting. */
export interface RecruiterContact {
  name?: string;
  email?: string;
  phone?: string;
}

/** The canonical record for one job posting. This is what gets written to Excel. */
export interface JobPosting {
  /** Stable id (e.g. hash of source + url) used to de-duplicate across runs. */
  id: string;
  title: string;
  company: string;
  location?: string;
  /** Which board this came from, e.g. "linkedin", "greenhouse". */
  source: string;
  /** Direct link to the posting / application page. */
  url: string;
  /** ISO date the job was posted, if the board exposes it. */
  datePosted?: string;
  /** ISO date the posting closes / application deadline, if available. */
  endDate?: string;
  description?: string;
  recruiter?: RecruiterContact;
  /** Application lifecycle status, tracked in the Excel workbook. */
  status?: ApplicationStatus;
  /** 0–1 fit score produced by the resume-matcher, if it has run. */
  fitScore?: number;
  /** ISO timestamp this record was first captured. */
  capturedAt: string;
}

export type ApplicationStatus =
  | "new"
  | "matched"
  | "applied"
  | "skipped"
  | "error";

/** Contract every job-board connector implements (Part 1). */
export interface JobBoardConnector {
  /** Unique source key, e.g. "linkedin". */
  readonly source: string;
  /** Search the board and return normalized postings. */
  search(query: JobSearchQuery): Promise<JobPosting[]>;
}

export interface JobSearchQuery {
  keywords: string[];
  location?: string;
  /** Only return jobs posted within this many days, if the board supports it. */
  postedWithinDays?: number;
}

/** Result of matching a resume against a job description (Part 3). */
export interface MatchResult {
  /** 0–1 overall fit. */
  fitScore: number;
  /** JD keywords/skills present in the resume. */
  matchedSkills: string[];
  /** JD keywords/skills missing from the resume. */
  missingSkills: string[];
  /** Short human-readable rationale. */
  summary: string;
  /** Optional tailored resume text, when tailoring is requested. */
  tailoredResume?: string;
}
