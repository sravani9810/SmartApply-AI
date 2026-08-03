import { corsJson, preflight } from "../../../lib/http";
import { getResumeContext } from "../../../db/queries";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * GET /api/resume-context — the applicant's structured résumé body (summary,
 * skills, experiences with approved bullets, education). The extension's
 * Auto-pilot uses it to (a) ground local-model answers in real experience and
 * (b) fill repeatable "Add experience / Add education" sections.
 */
export function GET() {
  return corsJson(getResumeContext());
}
