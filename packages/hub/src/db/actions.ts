"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "./client";
import * as s from "./schema";
import { autoTag } from "../lib/tags";
import { runIngest } from "../lib/ingest";
import { isJobStatus } from "../lib/status";
import type { ComposeState } from "../lib/compose";

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
  /** Carry back into the next follow-up to keep refining this résumé. */
  state?: ComposeState;
  /** All instructions applied so far, oldest first. */
  instructionsLog?: string[];
}

/**
 * Compose a résumé from a pasted JD + free-form edit instructions (the prompt
 * engine), or REFINE an existing one when `resumeId` + `current` state are
 * given. Saves/updates the résumé library entry and returns it for live preview.
 */
export async function composeResumeAction(input: {
  jd?: string; instructions?: string; flavorId?: string; targetRole?: string;
  /** Present when refining: the row to update in place. */
  resumeId?: string;
  /** Present when refining: the current résumé state to build on. */
  current?: ComposeState;
  /** Instructions applied in earlier turns (for context + logging). */
  priorInstructions?: string[];
}): Promise<ComposeResult> {
  try {
    const { composeResume } = await import("../lib/compose");
    const instruction = input.instructions?.trim() || undefined;
    const prior = (input.priorInstructions ?? []).filter(Boolean);
    const { resumeData, meta, usedClaude, state } = await composeResume({
      jd: input.jd?.trim() || undefined,
      instructions: instruction,
      flavorId: input.flavorId || undefined,
      targetRole: input.targetRole?.trim() || undefined,
      current: input.current,
      priorInstructions: prior,
    });

    const log = instruction ? [...prior, instruction] : prior;
    const label = [meta.company || meta.domain || "Résumé", meta.targetRole]
      .filter(Boolean).join(" — ");

    let id = input.resumeId;
    if (id) {
      // Refine in place: coalesce metadata so a targeted edit doesn't wipe fields.
      const existing = db.select().from(s.resumes).where(eq(s.resumes.id, id)).get();
      db.update(s.resumes).set({
        resumeData,
        // Keep the existing label (incl. a fork's "(copy)") stable across refines.
        label: existing?.label || label || "Résumé",
        instructions: log.join("\n") || existing?.instructions || null,
        company: meta.company || existing?.company || null,
        domain: meta.domain || existing?.domain || null,
        technologies: meta.technologies.length ? meta.technologies : (existing?.technologies ?? null),
        targetRole: meta.targetRole || existing?.targetRole || null,
        usedClaude,
      }).where(eq(s.resumes.id, id)).run();
      revalidatePath(`/resumes/${id}`);
    } else {
      id = crypto.randomUUID();
      db.insert(s.resumes).values({
        id,
        flavorId: input.flavorId || null,
        resumeData,
        label,
        jd: input.jd?.trim() || null,
        instructions: log.join("\n") || null,
        company: meta.company || null,
        domain: meta.domain || null,
        technologies: meta.technologies,
        targetRole: meta.targetRole || null,
        usedClaude,
      }).run();
    }

    revalidatePath("/resumes");
    return { ok: true, resumeId: id, usedClaude, meta, data: resumeData, state, instructionsLog: log };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Fork a saved résumé into a new library entry ("create another from this"),
 * copying its content + metadata so it can be refined independently. Redirects
 * to the new résumé's detail page.
 */
export async function duplicateResume(id: string) {
  const src = db.select().from(s.resumes).where(eq(s.resumes.id, id)).get();
  if (!src) return;
  const newId = crypto.randomUUID();
  db.insert(s.resumes).values({
    id: newId,
    flavorId: src.flavorId,
    resumeData: src.resumeData,
    label: `${src.label ?? "Résumé"} (copy)`,
    jd: src.jd,
    instructions: src.instructions,
    company: src.company,
    domain: src.domain,
    technologies: src.technologies,
    targetRole: src.targetRole,
    usedClaude: src.usedClaude,
  }).run();
  revalidatePath("/resumes");
  redirect(`/resumes/${newId}`);
}

/** Save the applicant's application-form fields (the hub profile page). */
export async function saveApplicantFields(formData: FormData) {
  const { APPLICANT_FIELD_KEYS } = await import("../lib/applicantFields");
  const fields: Record<string, string> = {};
  for (const key of APPLICANT_FIELD_KEYS) {
    const v = formData.get(key);
    if (typeof v === "string" && v.trim()) fields[key] = v.trim();
  }
  const existing = db.select().from(s.profile).where(eq(s.profile.id, "me")).get();
  if (existing) {
    db.update(s.profile).set({ fields }).where(eq(s.profile.id, "me")).run();
  } else {
    const emptyPersonal = {
      name: "", email: "", website: { readable: "", link: "" },
      github: { readable: "", link: "" }, linkedin: { readable: "", link: "" }, skillset: [],
    };
    db.insert(s.profile).values({ id: "me", data: emptyPersonal as never, fields }).run();
  }
  revalidatePath("/profile");
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
