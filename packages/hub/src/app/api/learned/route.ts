import { corsJson, preflight } from "../../../lib/http";
import { recordLearnedAnswer } from "../../../db/queries";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * POST /api/learned — record what the user typed into a form field the
 * extension couldn't match, so the hub can fill it next time.
 * Body: { label, value } or { answers: { label: value, … } }.
 */
export async function POST(req: Request) {
  let body: { label?: string; value?: string; answers?: Record<string, string> };
  try { body = await req.json(); } catch { return corsJson({ error: "invalid JSON" }, { status: 400 }); }

  let n = 0;
  if (body.answers && typeof body.answers === "object") {
    for (const [label, value] of Object.entries(body.answers)) {
      if (typeof value === "string") { recordLearnedAnswer(label, value); n++; }
    }
  } else if (typeof body.label === "string" && typeof body.value === "string") {
    recordLearnedAnswer(body.label, body.value);
    n = 1;
  } else {
    return corsJson({ error: "expected { label, value } or { answers }" }, { status: 400 });
  }
  return corsJson({ ok: true, recorded: n });
}
