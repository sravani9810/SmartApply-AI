import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import * as s from "../../../db/schema";
import { corsJson, preflight } from "../../../lib/http";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

interface Update { id: string; status: string; }

/**
 * POST /api/status — status write-back from the extension.
 * Body: { id, status } or { updates: [{ id, status }, ...] }.
 * Updates the job's status and, if an application exists, its status/appliedAt.
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return corsJson({ error: "invalid JSON" }, { status: 400 }); }
  const b = body as { id?: string; status?: string; updates?: Update[] };
  const updates: Update[] = b.updates ?? (b.id && b.status ? [{ id: b.id, status: b.status }] : []);
  if (updates.length === 0) return corsJson({ error: "no updates" }, { status: 400 });

  let applied = 0;
  const now = new Date().toISOString();
  for (const u of updates) {
    if (!u.id || !u.status) continue;
    const job = db.select().from(s.jobs).where(eq(s.jobs.id, u.id)).get();
    if (!job) continue;
    db.update(s.jobs).set({ status: u.status }).where(eq(s.jobs.id, u.id)).run();
    const app = db.select().from(s.applications).where(eq(s.applications.jobId, u.id)).get();
    if (app) {
      db.update(s.applications)
        .set({ status: u.status, appliedAt: u.status === "applied" ? now : app.appliedAt })
        .where(eq(s.applications.id, app.id)).run();
    }
    applied++;
  }
  return corsJson({ ok: true, updated: applied });
}
