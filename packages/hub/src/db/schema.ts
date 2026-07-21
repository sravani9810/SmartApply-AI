import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
import type { PersonalData, MatchResult } from "@smartapply/shared";

/**
 * SmartApply Hub schema (Part 0).
 *
 * Layered résumé model: a curated CONTENT LIBRARY (experiences + tagged bullet
 * pool + skills + summary snippets), FLAVORS that select/order from it, and
 * per-job RÉSUMÉ snapshots recorded on applications. Relationships are
 * graph-shaped (tags many-to-many + a tag ontology) but stored relationally —
 * traversed in memory, no graph engine. See docs/HUB_PLAN.md §4.
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

// ── Layer 1: content library ────────────────────────────────────────────────

/** Facts about one role/experience. Single-source so versions can't drift. */
export const experiences = sqliteTable("experiences", {
  id: text("id").primaryKey(),
  company: text("company").notNull(),
  title: text("title").notNull(),
  location: text("location").notNull().default(""),
  start: text("start").notNull().default(""),
  end: text("end").notNull().default(""),
  url: text("url").notNull().default(""),
  /** "work" | "project" — projects render under a separate section. */
  kind: text("kind").notNull().default("work"),
  /** Display order within its section (lower first). */
  ord: integer("ord").notNull().default(0),
  createdAt: text("created_at").notNull().default(now),
});

/** One achievement under an experience. Only `approved` bullets are ever emitted. */
export const bullets = sqliteTable(
  "bullets",
  {
    id: text("id").primaryKey(),
    experienceId: text("experience_id")
      .notNull()
      .references(() => experiences.id, { onDelete: "cascade" }),
    metric: text("metric"),
    approved: integer("approved", { mode: "boolean" }).notNull().default(true),
    ord: integer("ord").notNull().default(0),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("bullets_experience_idx").on(t.experienceId)],
);

/** A pre-written phrasing of a bullet (+ optional embedding for fuzzy recall). */
export const bulletVariants = sqliteTable(
  "bullet_variants",
  {
    id: text("id").primaryKey(),
    bulletId: text("bullet_id")
      .notNull()
      .references(() => bullets.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    /** Float32 embedding as JSON (sqlite-vec upgrade comes in Phase 4). */
    embedding: text("embedding"),
    /** The default phrasing shown unless a flavor rotates it. */
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("bullet_variants_bullet_idx").on(t.bulletId)],
);

/** Controlled tag vocabulary (domains + techs). */
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  /** "domain" | "tech" | "soft" */
  category: text("category").notNull().default("tech"),
});

/** Tag ontology: `child` implies `parent` (React → frontend). The only graph. */
export const tagEdges = sqliteTable(
  "tag_edges",
  {
    parentTagId: text("parent_tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    childTagId: text("child_tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("is_a"),
  },
  (t) => [primaryKey({ columns: [t.parentTagId, t.childTagId] })],
);

export const bulletTags = sqliteTable(
  "bullet_tags",
  {
    bulletId: text("bullet_id")
      .notNull()
      .references(() => bullets.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.bulletId, t.tagId] })],
);

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  ord: integer("ord").notNull().default(0),
});

export const skillTags = sqliteTable(
  "skill_tags",
  {
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.skillId, t.tagId] })],
);

export const summarySnippets = sqliteTable("summary_snippets", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  ord: integer("ord").notNull().default(0),
});

export const education = sqliteTable("education", {
  id: text("id").primaryKey(),
  degree: text("degree").notNull(),
  university: text("university").notNull(),
  location: text("location").notNull().default(""),
  start: text("start").notNull().default(""),
  end: text("end").notNull().default(""),
  url: text("url").notNull().default(""),
  description: text("description", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  ord: integer("ord").notNull().default(0),
});

// ── Layer 2: flavors ────────────────────────────────────────────────────────

export const flavors = sqliteTable("flavors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Domain tags this flavor emphasizes, as JSON string[]. */
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  pageBudget: integer("page_budget").notNull().default(2),
  createdAt: text("created_at").notNull().default(now),
});

/** Which bullets a flavor selects for an experience, and in what order. */
export const flavorBullets = sqliteTable(
  "flavor_bullets",
  {
    flavorId: text("flavor_id")
      .notNull()
      .references(() => flavors.id, { onDelete: "cascade" }),
    experienceId: text("experience_id")
      .notNull()
      .references(() => experiences.id, { onDelete: "cascade" }),
    bulletId: text("bullet_id")
      .notNull()
      .references(() => bullets.id, { onDelete: "cascade" }),
    ord: integer("ord").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.flavorId, t.bulletId] })],
);

// ── Jobs, résumés, applications ─────────────────────────────────────────────

/** Mirrors @smartapply/shared JobPosting; populated by Part 1 ingest. */
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location"),
  source: text("source").notNull().default(""),
  url: text("url").notNull().default(""),
  datePosted: text("date_posted"),
  endDate: text("end_date"),
  description: text("description"),
  recruiterName: text("recruiter_name"),
  recruiterEmail: text("recruiter_email"),
  recruiterPhone: text("recruiter_phone"),
  status: text("status").notNull().default("new"),
  fitScore: real("fit_score"),
  capturedAt: text("captured_at").notNull().default(now),
  lastSeenAt: text("last_seen_at").notNull().default(now),
});

export const jobTags = sqliteTable(
  "job_tags",
  {
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    weight: real("weight").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.tagId] })],
);

/** A compiled résumé instance — a frozen ResumeData snapshot + its PDF hash. */
export const resumes = sqliteTable("resumes", {
  id: text("id").primaryKey(),
  flavorId: text("flavor_id").references(() => flavors.id, { onDelete: "set null" }),
  resumeData: text("resume_data", { mode: "json" }).notNull(),
  pdfHash: text("pdf_hash"),
  createdAt: text("created_at").notNull().default(now),
});

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    resumeId: text("resume_id").references(() => resumes.id, { onDelete: "set null" }),
    status: text("status").notNull().default("new"),
    /** Last tailoring result (fit score, matched/missing skills, rationale). */
    match: text("match", { mode: "json" }).$type<MatchResult>(),
    /** Whether the last tailoring used Claude (vs the deterministic fallback). */
    usedClaude: integer("used_claude", { mode: "boolean" }),
    appliedAt: text("applied_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("applications_job_idx").on(t.jobId)],
);

/** Exactly which bullets went out on an application — provenance. */
export const applicationBullets = sqliteTable(
  "application_bullets",
  {
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    bulletId: text("bullet_id")
      .notNull()
      .references(() => bullets.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.applicationId, t.bulletId] })],
);

/** Answers the extension learned for unknown fields (mirrors chrome.storage). */
export const learnedAnswers = sqliteTable("learned_answers", {
  label: text("label").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(now),
});

/** Singleton applicant profile — the résumé header (name, email, links). */
export const profile = sqliteTable("profile", {
  id: text("id").primaryKey(), // always "me"
  data: text("data", { mode: "json" }).$type<PersonalData>().notNull(),
});
