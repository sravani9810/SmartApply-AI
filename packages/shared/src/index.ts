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

/**
 * Contract between Part 1 (pipeline) and Part 2 (extension).
 *
 * The pipeline writes a `jobs-export.json` the extension loads so it knows which
 * posting you're applying to. The extension writes a `status-updates.json` the
 * pipeline reads back to update the workbook/sheet with your application status.
 */

/** One job as exported to the extension (a slim view of JobPosting). */
export interface JobExportEntry {
  id: string;
  title: string;
  company: string;
  location?: string;
  source: string;
  url: string;
  status?: ApplicationStatus;
}

/** The `jobs-export.json` file the pipeline writes for the extension. */
export interface JobsExport {
  exportedAt: string;
  jobs: JobExportEntry[];
}

/** A single status change made in the extension. */
export interface StatusUpdate {
  id: string;
  status: ApplicationStatus;
  updatedAt: string;
}

/** The `status-updates.json` file the extension writes for the pipeline. */
export interface StatusUpdatesFile {
  updates: StatusUpdate[];
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

/**
 * Résumé render format (Part 0 / Part 4).
 *
 * The canonical shape the resume-builder's CV template renders and the hub
 * compiles a flavor down to. Kept in `@smartapply/shared` so the hub can produce
 * a `ResumeData` and the builder can render it.
 */
export interface SocialLink {
  readable: string;
  link: string;
}

export interface ResumeSkill {
  skill: string;
  level: string;
  optional?: boolean;
  new?: boolean;
}

export interface SkillSetCategory {
  type: string;
  label: string;
  skills: ResumeSkill[];
}

export interface PersonalData {
  name: string;
  website: SocialLink;
  email: string;
  phone?: string;
  github: SocialLink;
  linkedin: SocialLink;
  skillset: SkillSetCategory[];
}

export interface ResumeEntry {
  company: string;
  position: string;
  url: string;
  location: string;
  start: string;
  end: string;
  description: string[];
}

export interface EducationEntry {
  degree: string;
  university: string;
  url: string;
  location: string;
  start: string;
  end: string;
  description: string[];
}

export interface ResumeData {
  personal: PersonalData;
  /** Free-text summary paragraphs. */
  summary?: string[];
  /** Skill lines rendered as bullets (each string is one bullet). */
  skills?: string[];
  /** Personal / side projects. */
  projects?: ResumeEntry[];
  work_experience: ResumeEntry[];
  education: EducationEntry[];
}

/**
 * Hub library/flavor/application view contracts (Part 0).
 *
 * The hub's SQLite tables (via Drizzle) are the source of truth; these are the
 * cross-package shapes used at API boundaries (e.g. serving the extension).
 */
export type FlavorKey = "frontend" | "backend" | "sde" | "cloud" | string;

/** One application record: which résumé went to which job. */
export interface ApplicationRecord {
  id: string;
  jobId: string;
  resumeId?: string;
  flavor?: FlavorKey;
  status: ApplicationStatus;
  appliedAt?: string;
}
