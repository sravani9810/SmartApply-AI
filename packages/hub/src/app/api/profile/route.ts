import { corsJson, preflight } from "../../../lib/http";
import { getApplicantFields, getLearnedAnswers } from "../../../db/queries";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * GET /api/profile — the applicant's personal data for the extension to fill
 * with: the flat application fields + all learned answers. The hub is the
 * source of truth; the extension no longer stores its own profile.
 */
export function GET() {
  return corsJson({ fields: getApplicantFields(), learned: getLearnedAnswers() });
}
