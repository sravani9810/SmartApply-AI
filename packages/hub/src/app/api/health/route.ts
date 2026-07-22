import { corsJson, preflight } from "../../../lib/http";
import { checkClaude } from "../../../lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const OPTIONS = preflight;

/**
 * GET /api/health — liveness for the hub + Claude connectivity. A successful
 * response means the hub is up; `claude.online` says whether the hub can reach
 * Claude (subscription). `?fresh=1` bypasses the short-lived probe cache.
 * CORS-enabled so the extension can show both statuses.
 */
export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const claude = await checkClaude(fresh);
  return corsJson({ ok: true, claude });
}
