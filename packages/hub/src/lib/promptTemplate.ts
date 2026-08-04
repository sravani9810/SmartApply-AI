import { getSetting, setSetting } from "../db/queries";

const KEY = "tailor:promptTemplate";

/**
 * The instruction Claude gets when adapting the master résumé to a job.
 *
 * Kept as editable data rather than baked into the code because the trade-off
 * it encodes is a judgement call, not a constant: how aggressively to mirror
 * the JD's vocabulary is exactly the knob you want to turn after seeing a few
 * diffs. Placeholders are substituted before sending:
 *
 *   {{jobTitle}}  {{company}}  {{jd}}  {{resume}}
 */
export const DEFAULT_PROMPT_TEMPLATE = `You are adapting an existing résumé to one specific job so it scores well in \
applicant tracking systems (ATS), without misrepresenting the candidate.

JOB TITLE: {{jobTitle}}
COMPANY: {{company}}

JOB DESCRIPTION:
{{jd}}

CURRENT RÉSUMÉ (JSON):
{{resume}}

Rewrite the résumé for this job. Rules:

1. You MAY rephrase any bullet to mirror the job description's vocabulary —
   if the résumé says "queue" and the JD says "message broker", use the JD's
   term when it genuinely describes the same work.
2. You MAY reorder bullets within a role so the most relevant come first, and
   you MAY drop bullets that are irrelevant to this job. Keep at least 3
   bullets per role.
3. You MAY add technologies named in the job description to the skills section
   when they are plausibly adjacent to what the candidate already does.
4. You MUST NOT invent or alter: employers, job titles, dates, locations,
   degrees, or any number or metric. Every figure in your output must appear
   in the current résumé.
5. You MUST NOT add a new role, project, or education entry.
6. Keep the exact JSON shape you were given — same keys, same types, same
   order of sections. Skills lines keep their "<b>Category:</b> items" format.
7. Keep bullets to a similar length. This is an edit, not a rewrite from
   scratch: leave a bullet untouched when it is already well matched.

Return ONLY the complete résumé as a single JSON object with the same shape as
the input. No prose, no markdown fences, no commentary.`;

export function getPromptTemplate(): string {
  return getSetting<string>(KEY) ?? DEFAULT_PROMPT_TEMPLATE;
}

export function setPromptTemplate(text: string) {
  const t = text.trim();
  setSetting(KEY, t && t !== DEFAULT_PROMPT_TEMPLATE ? t : null);
}

export function isPromptCustomised(): boolean {
  return getSetting<string>(KEY) != null;
}

/** Substitute placeholders. Unknown placeholders are left alone, not blanked. */
export function renderPrompt(
  template: string,
  vars: { jobTitle: string; company: string; jd: string; resume: string },
): string {
  return template
    .replaceAll("{{jobTitle}}", vars.jobTitle)
    .replaceAll("{{company}}", vars.company)
    .replaceAll("{{jd}}", vars.jd)
    .replaceAll("{{resume}}", vars.resume);
}
