import { corsJson, preflight } from "../../../lib/http";
import { answerFields, type FieldRequest } from "../../../lib/answer";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const OPTIONS = preflight;

/**
 * POST /api/answer — Claude answers form fields the extension couldn't match,
 * grounded in the applicant's library + the job's JD.
 * Body: { url?, fields: [{ label, type?, options? }] } → { answers: { label: value } }.
 */
export async function POST(req: Request) {
  let body: { url?: string; fields?: FieldRequest[] };
  try { body = await req.json(); } catch { return corsJson({ error: "invalid JSON" }, { status: 400 }); }
  const fields = Array.isArray(body.fields) ? body.fields.filter((f) => f?.label) : [];
  if (fields.length === 0) return corsJson({ answers: {} });
  const answers = await answerFields(fields.slice(0, 25), body.url);
  return corsJson({ answers });
}
