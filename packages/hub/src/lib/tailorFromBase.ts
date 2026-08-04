import type { ResumeData } from "@smartapply/shared";
import { stripHtml } from "./tags";
import { logWarn } from "./log";
import { getPromptTemplate, renderPrompt } from "./promptTemplate";
import { getBaseResume } from "./baseResume";

export interface BaseTailorResult {
  ok: boolean;
  error?: string;
  before: ResumeData;
  after?: ResumeData;
  /** The exact prompt sent, so the UI can show what produced this. */
  prompt: string;
  usedClaude: boolean;
}

/** Pull the JSON object out of a reply that may still carry prose or fences. */
function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in the reply");
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Guard the shape before it reaches the diff or the PDF. A model that returns
 * something structurally wrong should fail loudly here rather than produce a
 * résumé that silently lost a section.
 */
function validate(data: unknown, before: ResumeData): ResumeData {
  const d = data as ResumeData;
  if (!d || typeof d !== "object") throw new Error("reply was not an object");
  if (!Array.isArray(d.work_experience) || d.work_experience.length === 0) {
    throw new Error("work_experience missing or empty");
  }
  if (!d.personal || typeof d.personal !== "object") throw new Error("personal section missing");

  // Personal details and education are never up for editing — take the
  // master's copies verbatim so a stray edit cannot reach the PDF.
  return {
    ...d,
    personal: before.personal,
    education: before.education,
    summary: Array.isArray(d.summary) ? d.summary : before.summary,
    skills: Array.isArray(d.skills) ? d.skills : before.skills,
    projects: Array.isArray(d.projects) ? d.projects : before.projects,
  };
}

/**
 * Adapt the master résumé to one job. Unlike tailorForJob — which composes a
 * résumé by selecting bullets from the library — this starts from a fixed
 * document and edits it, so the output is comparable to the input and the diff
 * means something.
 */
export async function tailorFromBase(
  job: { title: string; company?: string | null; description?: string | null },
): Promise<BaseTailorResult> {
  const before = getBaseResume();
  const prompt = renderPrompt(getPromptTemplate(), {
    jobTitle: job.title,
    company: job.company ?? "",
    jd: stripHtml(job.description ?? "").slice(0, 12000),
    resume: JSON.stringify(before, null, 2),
  });

  if (process.env.HUB_DISABLE_CLAUDE === "1") {
    return { ok: false, error: "Claude is disabled (HUB_DISABLE_CLAUDE=1)", before, prompt, usedClaude: false };
  }

  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const q = query({
      prompt,
      options: {
        // A full résumé is a large structured reply; one turn isn't always
        // enough to finish it, unlike the short JSON the other callers ask for.
        maxTurns: 4,
        permissionMode: "bypassPermissions",
        allowedTools: [],
        systemPrompt:
          "You edit résumés truthfully. You never invent employers, dates, degrees, " +
          "or numbers. You reply with a single JSON object and no other text.",
        ...(process.env.HUB_TAILOR_MODEL ? { model: process.env.HUB_TAILOR_MODEL } : {}),
      },
    });

    let text = "";
    for await (const m of q as AsyncIterable<Record<string, unknown>>) {
      for (const b of (m.content as Array<Record<string, unknown>> | undefined) ?? [])
        if (b.type === "text" && typeof b.text === "string") text += b.text;
      if (m.type === "result" && typeof m.result === "string") text += m.result;
    }
    if (!text.trim()) throw new Error("empty reply from Claude");

    const after = validate(extractJson(text), before);
    return { ok: true, before, after, prompt, usedClaude: true };
  } catch (err) {
    const error = (err as Error).message;
    logWarn("tailorFromBase", `failed: ${error}`);
    return { ok: false, error, before, prompt, usedClaude: false };
  }
}
