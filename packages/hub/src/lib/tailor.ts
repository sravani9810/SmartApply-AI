import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { MatchResult } from "@smartapply/shared";
import { db } from "../db/client";
import * as s from "../db/schema";
import { rankBullets, expandTags, type RankedExperience } from "./rank";
import { tailorWithClaude } from "./claude";
import { compile, type Selection } from "./compile";

export interface TailorOutcome {
  resumeId: string;
  applicationId: string;
  usedClaude: boolean;
  matchResult: MatchResult;
  selectedCount: number;
}

const PER_EXPERIENCE = 6;

/** Deterministic fallback: top-scored bullets per experience + a coverage summary. */
function deterministic(ranked: RankedExperience[], jobTagNames: string[]) {
  const selection: Selection = new Map();
  const chosenTags = new Set<string>();
  for (const e of ranked) {
    const top = e.bullets.slice(0, PER_EXPERIENCE);
    if (top.length) {
      selection.set(e.experienceId, top.map((b) => b.bulletId));
      for (const b of top) for (const t of b.tags) chosenTags.add(t);
    }
  }
  const covered = expandTags(chosenTags);
  const wanted = expandTags(jobTagNames);
  const matched = jobTagNames.filter((t) => covered.has(t));
  const missing = jobTagNames.filter((t) => !covered.has(t));
  void wanted;
  const matchResult: MatchResult = {
    fitScore: jobTagNames.length ? matched.length / jobTagNames.length : 0.5,
    matchedSkills: matched,
    missingSkills: missing,
    summary: jobTagNames.length
      ? `Tag-based match: covered ${matched.length} of ${jobTagNames.length} job skills.`
      : "No job tags yet — run Analyze on the job for a sharper match.",
  };
  return { selection, matchResult };
}

/**
 * Tailor a résumé for a job: rank the applicant's approved bullets against the
 * JD, let Claude (subscription) select/order them (falling back to the
 * deterministic ranking), compile a ResumeData, and record the résumé +
 * application. Returns the fit result and what was saved.
 */
export async function tailorForJob(jobId: string, flavorId: string): Promise<TailorOutcome> {
  const job = db.select().from(s.jobs).where(eq(s.jobs.id, jobId)).get();
  if (!job) throw new Error(`job ${jobId} not found`);

  const ranked = rankBullets(jobId);
  const jobTagRows = db.select().from(s.jobTags).where(eq(s.jobTags.jobId, jobId)).all();
  const tagNameById = new Map(db.select().from(s.tags).all().map((t) => [t.id, t.name]));
  const jobTagNames = jobTagRows.map((r) => tagNameById.get(r.tagId) ?? "").filter(Boolean);

  const llm = await tailorWithClaude(job.description ?? "", job.title, ranked);
  let selection: Selection;
  let matchResult: MatchResult;
  let usedClaude = false;

  if (llm) {
    usedClaude = true;
    matchResult = llm.matchResult;
    selection = new Map(Object.entries(llm.selection).map(([k, v]) => [k, v]));
  } else {
    ({ selection, matchResult } = deterministic(ranked, jobTagNames));
  }

  const resumeData = compile(flavorId, selection);
  const selectedBulletIds = [...selection.values()].flat();

  // Persist: résumé snapshot, application, provenance bullets, job fit/status.
  const resumeId = randomUUID();
  db.insert(s.resumes).values({ id: resumeId, flavorId, resumeData }).run();

  const existing = db.select().from(s.applications).where(eq(s.applications.jobId, jobId)).get();
  const applicationId = existing?.id ?? randomUUID();
  if (existing) {
    db.update(s.applications).set({
      resumeId, match: matchResult, usedClaude,
      status: existing.status === "new" ? "matched" : existing.status,
    }).where(eq(s.applications.id, applicationId)).run();
  } else {
    db.insert(s.applications).values({
      id: applicationId, jobId, resumeId, status: "matched", match: matchResult, usedClaude,
    }).run();
  }
  db.delete(s.applicationBullets).where(eq(s.applicationBullets.applicationId, applicationId)).run();
  for (const bulletId of selectedBulletIds) {
    db.insert(s.applicationBullets).values({ applicationId, bulletId }).onConflictDoNothing().run();
  }

  db.update(s.jobs)
    .set({ fitScore: matchResult.fitScore, status: job.status === "new" ? "matched" : job.status })
    .where(eq(s.jobs.id, jobId)).run();

  return { resumeId, applicationId, usedClaude, matchResult, selectedCount: selectedBulletIds.length };
}
