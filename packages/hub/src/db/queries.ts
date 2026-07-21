import { sql, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import * as s from "./schema";

const count = (table: Parameters<typeof db.select>[0] extends never ? never : any) =>
  db.select({ n: sql<number>`count(*)` }).from(table).get()?.n ?? 0;

export function getStats() {
  return {
    experiences: count(s.experiences),
    bullets: count(s.bullets),
    tags: count(s.tags),
    skills: count(s.skills),
    flavors: count(s.flavors),
    jobs: count(s.jobs),
    applications: count(s.applications),
  };
}

export function getJobs(limit = 50, status?: string) {
  const cols = {
    id: s.jobs.id,
    title: s.jobs.title,
    company: s.jobs.company,
    location: s.jobs.location,
    source: s.jobs.source,
    status: s.jobs.status,
    url: s.jobs.url,
  };
  const q = db.select(cols).from(s.jobs);
  const rows = status
    ? q.where(eq(s.jobs.status, status))
    : q;
  return rows.orderBy(sql`${s.jobs.capturedAt} desc`).limit(limit).all();
}

/** Count of jobs per status, for the dashboard filter bar. */
export function getStatusCounts(): Record<string, number> {
  const rows = db.select({ status: s.jobs.status, n: sql<number>`count(*)` })
    .from(s.jobs).groupBy(s.jobs.status).all();
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export function getFlavors() {
  const flavors = db.select().from(s.flavors).all();
  return flavors.map((f) => ({
    ...f,
    bulletCount:
      db.select({ n: sql<number>`count(*)` }).from(s.flavorBullets)
        .where(eq(s.flavorBullets.flavorId, f.id)).get()?.n ?? 0,
  }));
}

// ── Library (curate view) ───────────────────────────────────────────────────

export interface LibraryBullet {
  id: string;
  approved: boolean;
  text: string;
  tags: string[];
  flavors: string[];
}
export interface LibraryExperience {
  id: string;
  company: string;
  title: string;
  location: string;
  start: string;
  end: string;
  kind: string;
  bullets: LibraryBullet[];
}

export function getLibrary(): LibraryExperience[] {
  const experiences = db.select().from(s.experiences)
    .orderBy(s.experiences.kind, s.experiences.ord).all();
  const flavorName = new Map(db.select().from(s.flavors).all().map((f) => [f.id, f.name]));
  const tagName = new Map(db.select().from(s.tags).all().map((t) => [t.id, t.name]));

  return experiences.map((e) => {
    const bulletRows = db.select().from(s.bullets)
      .where(eq(s.bullets.experienceId, e.id)).orderBy(s.bullets.ord).all();
    const bullets: LibraryBullet[] = bulletRows.map((b) => {
      const primary = db.select().from(s.bulletVariants)
        .where(eq(s.bulletVariants.bulletId, b.id)).orderBy(s.bulletVariants.isPrimary).all();
      const text = primary.find((v) => v.isPrimary)?.text ?? primary[0]?.text ?? "";
      const tags = db.select().from(s.bulletTags).where(eq(s.bulletTags.bulletId, b.id)).all()
        .map((r) => tagName.get(r.tagId) ?? "").filter(Boolean);
      const flavors = db.select().from(s.flavorBullets).where(eq(s.flavorBullets.bulletId, b.id)).all()
        .map((r) => flavorName.get(r.flavorId) ?? "").filter(Boolean);
      return { id: b.id, approved: b.approved, text, tags, flavors };
    });
    return {
      id: e.id, company: e.company, title: e.title, location: e.location,
      start: e.start, end: e.end, kind: e.kind, bullets,
    };
  });
}

export function getSkills() {
  return db.select().from(s.skills).orderBy(s.skills.ord).all();
}
export function getSummarySnippets() {
  return db.select().from(s.summarySnippets).orderBy(s.summarySnippets.ord).all();
}

// ── Jobs ────────────────────────────────────────────────────────────────────

export function getJob(id: string) {
  return db.select().from(s.jobs).where(eq(s.jobs.id, id)).get();
}

export function getJobTagNames(jobId: string): string[] {
  const rows = db.select().from(s.jobTags).where(eq(s.jobTags.jobId, jobId)).all();
  if (rows.length === 0) return [];
  const tagIds = rows.map((r) => r.tagId);
  return db.select().from(s.tags).where(inArray(s.tags.id, tagIds)).all().map((t) => t.name);
}

/** Tag overlap between a job's tags and each flavor's tags (a Phase-4 preview). */
export function getFlavorFit(jobTags: string[]) {
  const set = new Set(jobTags);
  return db.select().from(s.flavors).all()
    .map((f) => ({ name: f.name, overlap: (f.tags ?? []).filter((t) => set.has(t)).length }))
    .sort((a, b) => b.overlap - a.overlap);
}

export function getTailoringForJob(jobId: string) {
  return db.select().from(s.applications).where(eq(s.applications.jobId, jobId)).get();
}

export function getResume(id: string) {
  const r = db.select().from(s.resumes).where(eq(s.resumes.id, id)).get();
  if (!r) return null;
  return { ...r, data: r.resumeData as import("@smartapply/shared").ResumeData };
}

export function getApplications() {
  return db.select({
    id: s.applications.id,
    status: s.applications.status,
    appliedAt: s.applications.appliedAt,
    resumeId: s.applications.resumeId,
    match: s.applications.match,
    usedClaude: s.applications.usedClaude,
    jobId: s.applications.jobId,
    jobTitle: s.jobs.title,
    jobCompany: s.jobs.company,
  }).from(s.applications)
    .leftJoin(s.jobs, eq(s.jobs.id, s.applications.jobId))
    .orderBy(sql`${s.applications.createdAt} desc`).all();
}
