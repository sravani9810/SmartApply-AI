import { eq } from "drizzle-orm";
import { db } from "../../../../db/client";
import * as s from "../../../../db/schema";
import { corsJson, preflight } from "../../../../lib/http";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * GET /api/application/[jobId] — per-job context the extension shows on the
 * application tab: whether a résumé was tailored, its flavor, fit, status, and
 * the PDF URL to attach.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const app = db.select().from(s.applications).where(eq(s.applications.jobId, jobId)).get();
  if (!app || !app.resumeId) {
    return corsJson({ jobId, tailored: false });
  }
  const resume = db.select().from(s.resumes).where(eq(s.resumes.id, app.resumeId)).get();
  const flavor = resume?.flavorId
    ? db.select().from(s.flavors).where(eq(s.flavors.id, resume.flavorId)).get()?.name
    : undefined;
  return corsJson({
    jobId,
    tailored: true,
    status: app.status,
    flavor: flavor ?? null,
    fitScore: app.match?.fitScore ?? null,
    usedClaude: app.usedClaude ?? false,
    resumeId: app.resumeId,
    pdfUrl: `/api/resume/${app.resumeId}/pdf`,
  });
}
