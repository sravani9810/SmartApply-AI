"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "./client";
import * as s from "./schema";
import { autoTag } from "../lib/tags";
import { runIngest } from "../lib/ingest";
import { isJobStatus } from "../lib/status";

/** Set a job's status and mirror it onto its application (shared by row + bulk). */
function applyStatusToJob(jobId: string, status: string) {
  if (!isJobStatus(status)) return;
  const job = db.select().from(s.jobs).where(eq(s.jobs.id, jobId)).get();
  if (!job) return;
  db.update(s.jobs).set({ status }).where(eq(s.jobs.id, jobId)).run();
  const app = db.select().from(s.applications).where(eq(s.applications.jobId, jobId)).get();
  if (app) {
    db.update(s.applications)
      .set({ status, appliedAt: status === "applied" ? new Date().toISOString() : app.appliedAt })
      .where(eq(s.applications.id, app.id)).run();
  }
}

/** Row action: set one job's status (Apply / Not applying buttons). */
export async function setStatusValue(jobId: string, status: string) {
  applyStatusToJob(jobId, status);
  revalidatePath("/");
  revalidatePath("/applications");
  revalidatePath(`/jobs/${jobId}`);
}

/** Bulk action: set many jobs' status from the table checkboxes. */
export async function bulkSetStatus(ids: string[], status: string) {
  for (const id of ids) applyStatusToJob(id, status);
  revalidatePath("/");
  revalidatePath("/applications");
}

export interface ComposeResult {
  ok: boolean;
  error?: string;
  resumeId?: string;
  usedClaude?: boolean;
  meta?: { company: string; domain: string; technologies: string[]; targetRole: string };
  data?: import("@smartapply/shared").ResumeData;
}

/**
 * Compose a résumé from a pasted JD + free-form edit instructions (the prompt
 * engine), save it to the résumé library, and return it for live preview.
 */
export async function composeResumeAction(input: {
  jd?: string; instructions?: string; flavorId?: string; targetRole?: string;
}): Promise<ComposeResult> {
  try {
    const { composeResume } = await import("../lib/compose");
    const { resumeData, meta, usedClaude } = await composeResume({
      jd: input.jd?.trim() || undefined,
      instructions: input.instructions?.trim() || undefined,
      flavorId: input.flavorId || undefined,
      targetRole: input.targetRole?.trim() || undefined,
    });

    const label = [meta.company || meta.domain || "Résumé", meta.targetRole]
      .filter(Boolean).join(" — ");
    const id = crypto.randomUUID();
    db.insert(s.resumes).values({
      id,
      flavorId: input.flavorId || null,
      resumeData,
      label,
      jd: input.jd?.trim() || null,
      instructions: input.instructions?.trim() || null,
      company: meta.company || null,
      domain: meta.domain || null,
      technologies: meta.technologies,
      targetRole: meta.targetRole || null,
      usedClaude,
    }).run();

    revalidatePath("/resumes");
    return { ok: true, resumeId: id, usedClaude, meta, data: resumeData };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Run the Part 1 pipeline and upsert jobs into the DB (dashboard button). */
export async function refreshJobs() {
  await runIngest();
  revalidatePath("/");
}

/** Tailor a résumé for a job with the chosen flavor (Claude on subscription). */
export async function tailorJob(jobId: string, formData: FormData) {
  const flavorId = String(formData.get("flavorId") ?? "");
  if (!flavorId) return;
  const { tailorForJob } = await import("../lib/tailor");
  await tailorForJob(jobId, flavorId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/applications");
  revalidatePath("/");
}

/** Edit a bullet's primary phrasing. */
export async function editBulletText(bulletId: string, formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  const primary = db.select().from(s.bulletVariants)
    .where(eq(s.bulletVariants.bulletId, bulletId)).all()
    .find((v) => v.isPrimary);
  if (primary) {
    db.update(s.bulletVariants).set({ text }).where(eq(s.bulletVariants.id, primary.id)).run();
  } else {
    db.insert(s.bulletVariants).values({
      id: crypto.randomUUID(), bulletId, text, isPrimary: true,
    }).run();
  }
  revalidatePath("/library");
}

/** Flip whether a bullet is eligible to be emitted. */
export async function toggleBulletApproved(bulletId: string) {
  const b = db.select().from(s.bullets).where(eq(s.bullets.id, bulletId)).get();
  if (!b) return;
  db.update(s.bullets).set({ approved: !b.approved }).where(eq(s.bullets.id, bulletId)).run();
  revalidatePath("/library");
}

/** Set a job's application status. */
export async function setJobStatus(jobId: string, formData: FormData) {
  const status = String(formData.get("status") ?? "new");
  db.update(s.jobs).set({ status }).where(eq(s.jobs.id, jobId)).run();
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/");
}

/** Auto-tag a job from its description (explicit half of Phase-4 matching). */
export async function analyzeJob(jobId: string) {
  const job = db.select().from(s.jobs).where(eq(s.jobs.id, jobId)).get();
  if (!job) return;
  const text = [job.title, job.description ?? ""].join(" ");
  const names = autoTag(text);
  db.delete(s.jobTags).where(eq(s.jobTags.jobId, jobId)).run();
  for (const name of names) {
    const tag = db.select().from(s.tags).where(eq(s.tags.name, name)).get();
    if (tag) db.insert(s.jobTags).values({ jobId, tagId: tag.id, weight: 1 }).onConflictDoNothing().run();
  }
  revalidatePath(`/jobs/${jobId}`);
}
