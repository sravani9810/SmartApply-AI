import { NextResponse } from "next/server";
import { logError } from "../../../lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // job discovery (esp. a live browser board) can be slow

/**
 * POST /api/ingest — run the Part 1 pipeline and upsert results into the hub DB.
 * Called by the dashboard "Refresh jobs" button and can be hit by the scheduler.
 */
export async function POST() {
  try {
    const { runIngest } = await import("../../../lib/ingest");
    const result = await runIngest();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logError("api.ingest", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
