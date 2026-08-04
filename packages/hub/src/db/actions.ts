"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "./client";
import * as s from "./schema";
import { autoTag } from "../lib/tags";
import { runIngest } from "../lib/ingest";
import { isJobStatus } from "../lib/status";
import { logError } from "../lib/log";
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
    logError("compose", err, { resumeId: input.resumeId });
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

/**
 * Learned answers are what the extension fills unmatched fields with, so a bad
 * one silently repeats itself on every future application. These let you fix or
 * forget an answer instead of clearing all of them.
 *
 * The label is the matching key: renaming it changes which question the answer
 * responds to, so it is a delete + re-insert rather than an update.
 */
export async function saveLearnedAnswer(formData: FormData) {
  const { recordLearnedAnswer, renameLearnedAnswer } = await import("./queries");
  const label = String(formData.get("label") ?? "").trim();
  const newLabel = String(formData.get("newLabel") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  if (!label) return;

  if (newLabel && newLabel !== label) {
    renameLearnedAnswer(label, newLabel);
    if (value) recordLearnedAnswer(newLabel, value);
  } else if (value) {
    recordLearnedAnswer(label, value);
  }
  revalidatePath("/profile");
}

export async function removeLearnedAnswer(formData: FormData) {
  const { deleteLearnedAnswer } = await import("./queries");
  const label = String(formData.get("label") ?? "").trim();
  if (label) deleteLearnedAnswer(label);
  revalidatePath("/profile");
}

export async function addLearnedAnswer(formData: FormData) {
  const { recordLearnedAnswer } = await import("./queries");
  const label = String(formData.get("label") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  if (label && value) recordLearnedAnswer(label, value);
  revalidatePath("/profile");
}

/**
 * Delete a résumé from the library.
 *
 * PDFs are rendered on demand rather than stored, so there is no file to clean
 * up, and applications.resumeId is ON DELETE SET NULL — an application keeps
 * its history and simply loses the link. `redirectTo` lets the detail page send
 * you back to the library while the library page deletes in place.
 */
export async function deleteResume(id: string, redirectTo?: string) {
  const row = db.select().from(s.resumes).where(eq(s.resumes.id, id)).get();
  if (!row) return;
  db.delete(s.resumes).where(eq(s.resumes.id, id)).run();
  revalidatePath("/resumes");
  revalidatePath("/applications");
  if (redirectTo) redirect(redirectTo);
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

/** Turn the OS (launchd) job-search scheduler on/off, or run it once now. */
export async function controlSchedulerAction(cmd: "on" | "off" | "now") {
  const { controlScheduler } = await import("../lib/scheduler");
  const res = await controlScheduler(cmd);
  revalidatePath("/scheduler");
  return res;
}

/** Set which platforms the scheduled ingest scrapes (hub toggles). */
export async function setSchedulerSourcesAction(sources: string[]) {
  const { setSchedulerSources } = await import("./queries");
  setSchedulerSources(sources);
  revalidatePath("/scheduler");
}

/** Run the Part 1 pipeline and upsert jobs into the DB (dashboard button). */
export async function refreshJobs() {
  await runIngest();
  revalidatePath("/");
}

export interface SearchResult {
  ok: boolean;
  error?: string;
  received?: number;
  written?: number;
}

/**
 * Scrape jobs for a specific search (keywords + location) via the Part 1
 * pipeline and import them into the hub. Powers the dashboard search box.
 */
export async function searchJobsAction(input: {
  keywords: string; location?: string; postedWithinDays?: number; sources?: string[];
}): Promise<SearchResult> {
  const keywords = input.keywords.split(",").map((k) => k.trim()).filter(Boolean);
  if (keywords.length === 0) return { ok: false, error: "Enter at least one keyword." };
  const sources = (input.sources ?? []).filter(Boolean);
  if (sources.length === 0) return { ok: false, error: "Pick at least one platform to search." };
  const query = {
    keywords,
    location: input.location?.trim() || undefined,
    postedWithinDays: input.postedWithinDays && input.postedWithinDays > 0 ? input.postedWithinDays : 7,
  };
  try {
    const { received, written } = await runIngest([query], sources);
    revalidatePath("/");
    return { ok: true, received, written };
  } catch (err) {
    logError("search", err, { keywords, sources });
    return { ok: false, error: (err as Error).message };
  }
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

// ── Résumé: direct save / rename / find / load / link ───────────────────────

/**
 * Persist an inline-edited résumé's data (and optionally its label) directly —
 * no recompose. This is the "save my in-hub edits" path, distinct from
 * composeResumeAction which reselects bullets from the library via Claude.
 */
export async function saveResumeData(
  resumeId: string,
  data: import("@smartapply/shared").ResumeData,
  label?: string,
): Promise<{ ok: boolean; error?: string; resumeId?: string }> {
  const existing = db.select().from(s.resumes).where(eq(s.resumes.id, resumeId)).get();
  if (!existing) return { ok: false, error: "résumé not found" };
  const clean = label?.trim();
  db.update(s.resumes)
    .set({ resumeData: data as never, ...(clean ? { label: clean } : {}) })
    .where(eq(s.resumes.id, resumeId))
    .run();
  revalidatePath(`/resumes/${resumeId}`);
  revalidatePath("/resumes");
  return { ok: true, resumeId };
}

/** Rename a résumé's library label. */
export async function renameResume(resumeId: string, label: string): Promise<{ ok: boolean; error?: string }> {
  const l = label.trim();
  if (!l) return { ok: false, error: "name required" };
  const existing = db.select().from(s.resumes).where(eq(s.resumes.id, resumeId)).get();
  if (!existing) return { ok: false, error: "résumé not found" };
  db.update(s.resumes).set({ label: l }).where(eq(s.resumes.id, resumeId)).run();
  revalidatePath(`/resumes/${resumeId}`);
  revalidatePath("/resumes");
  return { ok: true };
}

/** Create a new library entry from explicit ResumeData (Save-as-new from the composer). */
export async function createResumeFromData(input: {
  data: import("@smartapply/shared").ResumeData;
  label?: string;
  company?: string;
  domain?: string;
  technologies?: string[];
  targetRole?: string;
  jd?: string;
  usedClaude?: boolean;
}): Promise<{ ok: boolean; error?: string; resumeId?: string }> {
  const id = crypto.randomUUID();
  db.insert(s.resumes).values({
    id,
    flavorId: null,
    resumeData: input.data as never,
    label: input.label?.trim() || "Résumé",
    jd: input.jd?.trim() || null,
    company: input.company || null,
    domain: input.domain || null,
    technologies: input.technologies ?? null,
    targetRole: input.targetRole || null,
    usedClaude: input.usedClaude ?? false,
  }).run();
  revalidatePath("/resumes");
  return { ok: true, resumeId: id };
}

export interface FindResumesResult {
  ok: boolean;
  error?: string;
  results: import("../lib/findResumes").FoundResume[];
}

/** Find existing résumés best matching a JD (deterministic keyword/tech overlap). */
export async function findResumesAction(jd: string): Promise<FindResumesResult> {
  try {
    const { findResumesForJd } = await import("../lib/findResumes");
    return { ok: true, results: findResumesForJd(jd ?? "", 8) };
  } catch (err) {
    logError("find", err);
    return { ok: false, error: (err as Error).message, results: [] };
  }
}

export interface LoadResumeResult {
  ok: boolean;
  error?: string;
  resumeId?: string;
  data?: import("@smartapply/shared").ResumeData;
  state?: ComposeState;
  instructionsLog?: string[];
  label?: string;
  meta?: { company: string; domain: string; technologies: string[]; targetRole: string };
  jd?: string;
  flavorId?: string;
}

/** Load a saved résumé's data + refinable state for the composer editor. */
export async function loadResumeAction(resumeId: string): Promise<LoadResumeResult> {
  const r = db.select().from(s.resumes).where(eq(s.resumes.id, resumeId)).get();
  if (!r) return { ok: false, error: "résumé not found" };
  const data = r.resumeData as import("@smartapply/shared").ResumeData;
  const { deriveState } = await import("../lib/compose");
  const state = deriveState(data);
  const log = (r.instructions ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  return {
    ok: true,
    resumeId: r.id,
    data,
    state,
    instructionsLog: log,
    label: r.label ?? "Résumé",
    meta: {
      company: r.company ?? "",
      domain: r.domain ?? "",
      technologies: (r.technologies as string[] | null) ?? [],
      targetRole: r.targetRole ?? "",
    },
    jd: r.jd ?? undefined,
    flavorId: r.flavorId ?? undefined,
  };
}

/**
 * Link a résumé to a job by upserting its application row so the job page shows
 * the résumé and the dashboard row reflects that you've started applying.
 */
export async function linkResumeToJob(resumeId: string, jobId: string): Promise<{ ok: boolean; error?: string }> {
  const job = db.select().from(s.jobs).where(eq(s.jobs.id, jobId)).get();
  if (!job) return { ok: false, error: "job not found" };
  const existing = db.select().from(s.applications).where(eq(s.applications.jobId, jobId)).get();
  if (existing) {
    db.update(s.applications).set({ resumeId }).where(eq(s.applications.id, existing.id)).run();
  } else {
    db.insert(s.applications).values({
      id: crypto.randomUUID(),
      jobId,
      resumeId,
      status: "in-progress",
    }).run();
  }
  // Reflect "started applying" on the job row if it was still untouched.
  if (job.status === "new") {
    db.update(s.jobs).set({ status: "in-progress" }).where(eq(s.jobs.id, jobId)).run();
  }
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/");
  revalidatePath("/applications");
  return { ok: true };
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
