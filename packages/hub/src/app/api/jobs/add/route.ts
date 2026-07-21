import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../db/client";
import * as s from "../../../../db/schema";
import { autoTag } from "../../../../lib/tags";
import { corsJson, preflight } from "../../../../lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const OPTIONS = preflight;

const stableId = (source: string, url: string) =>
  createHash("sha1").update(`${source}::${url}`).digest("hex").slice(0, 16);

function hostSource(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").split(".")[0] || "manual"; }
  catch { return "manual"; }
}

/**
 * POST /api/jobs/add — the extension's "Add this job & generate résumé".
 * Body: { url, title, company?, location?, description?, source?, flavorId? }
 * Creates/refreshes the job, tags it from the JD, picks the best-fit flavor
 * (unless one is given), and tailors a résumé. Returns the fit + PDF url.
 */
export async function POST(req: Request) {
  let body: Record<string, string | undefined>;
  try { body = await req.json(); } catch { return corsJson({ error: "invalid JSON" }, { status: 400 }); }
  const url = (body.url ?? "").trim();
  const title = (body.title ?? "").trim();
  if (!url || !title) return corsJson({ error: "url and title are required" }, { status: 400 });

  const source = body.source || hostSource(url);
  const id = stableId(source, url);
  const now = new Date().toISOString();
  const description = body.description?.trim() || null;

  const existing = db.select().from(s.jobs).where(eq(s.jobs.id, id)).get();
  if (existing) {
    db.update(s.jobs).set({
      title, company: body.company ?? existing.company, location: body.location ?? existing.location,
      description: description ?? existing.description, lastSeenAt: now,
    }).where(eq(s.jobs.id, id)).run();
  } else {
    db.insert(s.jobs).values({
      id, title, company: body.company ?? "", location: body.location ?? null,
      source, url, description, status: "new", capturedAt: now, lastSeenAt: now,
    }).run();
  }

  // Tag from the JD.
  const names = autoTag([title, description ?? ""].join(" "));
  db.delete(s.jobTags).where(eq(s.jobTags.jobId, id)).run();
  for (const n of names) {
    const t = db.select().from(s.tags).where(eq(s.tags.name, n)).get();
    if (t) db.insert(s.jobTags).values({ jobId: id, tagId: t.id, weight: 1 }).onConflictDoNothing().run();
  }

  // Pick the flavor: caller's choice, else best tag overlap.
  const tagSet = new Set(names);
  const flavors = db.select().from(s.flavors).all();
  const best = flavors
    .map((f) => ({ f, overlap: (f.tags ?? []).filter((t) => tagSet.has(t)).length }))
    .sort((a, b) => b.overlap - a.overlap)[0]?.f;
  const flavorId = body.flavorId || best?.id;
  if (!flavorId) return corsJson({ error: "no flavors configured; run db:seed" }, { status: 400 });

  const { tailorForJob } = await import("../../../../lib/tailor");
  const outcome = await tailorForJob(id, flavorId);

  return corsJson({
    ok: true,
    jobId: id,
    resumeId: outcome.resumeId,
    usedClaude: outcome.usedClaude,
    flavor: flavors.find((f) => f.id === flavorId)?.name ?? null,
    fitScore: outcome.matchResult.fitScore,
    matchResult: outcome.matchResult,
    pdfUrl: `/api/resume/${outcome.resumeId}/pdf`,
    jobUrl: `/jobs/${id}`,
  });
}
