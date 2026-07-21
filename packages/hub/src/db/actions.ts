"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "./client";
import * as s from "./schema";
import { autoTag } from "../lib/tags";
import { runIngest } from "../lib/ingest";

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
