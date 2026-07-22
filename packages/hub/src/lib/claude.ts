import type { MatchResult } from "@smartapply/shared";
import { stripHtml } from "./tags";
import type { RankedExperience } from "./rank";

export interface TailorLLMResult {
  matchResult: MatchResult;
  /** experienceId -> ordered bulletIds chosen from the provided candidates. */
  selection: Record<string, string[]>;
}

const CANDIDATES_PER_EXPERIENCE = 8;

function buildPrompt(jd: string, jobTitle: string, candidates: RankedExperience[]): string {
  const sections = candidates
    .filter((e) => e.bullets.length > 0)
    .map((e) => {
      const lines = e.bullets
        .slice(0, CANDIDATES_PER_EXPERIENCE)
        .map((b) => `    - id=${b.bulletId} :: ${stripHtml(b.text)}`)
        .join("\n");
      return `  Experience ${e.experienceId} — ${e.title} @ ${e.company} (${e.kind}):\n${lines}`;
    })
    .join("\n\n");

  return `You are tailoring an existing résumé to a specific job by SELECTING and ORDERING \
the applicant's own already-written, approved bullet points. You must NOT invent, \
rewrite, or fabricate any experience — only choose from the candidate bullets given, \
by their id.

JOB TITLE: ${jobTitle}

JOB DESCRIPTION:
${jd.slice(0, 8000)}

CANDIDATE BULLETS (choose only from these ids):
${sections}

Return ONLY a single JSON object (no prose, no markdown fences) with this exact shape:
{
  "fitScore": <number 0..1, how well the applicant fits this job>,
  "matchedSkills": [<skills the JD wants that the selected bullets demonstrate>],
  "missingSkills": [<skills the JD wants that the applicant has no bullet for>],
  "summary": "<2-3 sentence rationale>",
  "selection": { "<experienceId>": ["<bulletId>", ...ordered best-first], ... }
}

Rules:
- For each experience include only its 4-6 most relevant bullet ids (fewer if weak).
- Use only ids that appear above; never emit an id from a different experience.
- Order the ids within each experience most-relevant first.`;
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}

function coerce(raw: unknown, validIds: Set<string>): TailorLLMResult {
  const o = raw as Record<string, unknown>;
  const selRaw = (o.selection ?? {}) as Record<string, unknown>;
  const selection: Record<string, string[]> = {};
  for (const [expId, ids] of Object.entries(selRaw)) {
    if (!Array.isArray(ids)) continue;
    const kept = ids.filter((id): id is string => typeof id === "string" && validIds.has(id));
    if (kept.length) selection[expId] = kept;
  }
  if (Object.keys(selection).length === 0) throw new Error("empty/invalid selection");
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  const fit = typeof o.fitScore === "number" ? Math.max(0, Math.min(1, o.fitScore)) : 0.5;
  return {
    selection,
    matchResult: {
      fitScore: fit,
      matchedSkills: arr(o.matchedSkills),
      missingSkills: arr(o.missingSkills),
      summary: typeof o.summary === "string" ? o.summary : "",
    },
  };
}

/**
 * Tailor via the Claude Agent SDK, billed to the user's Claude subscription
 * (the `claude` CLI's subscription login). Returns null when the SDK isn't
 * installed, the user isn't logged in, or the model's output can't be parsed —
 * the caller then falls back to deterministic ranking.
 */
export async function tailorWithClaude(
  jd: string,
  jobTitle: string,
  candidates: RankedExperience[],
): Promise<TailorLLMResult | null> {
  if (process.env.HUB_DISABLE_CLAUDE === "1") return null; // force deterministic fallback

  const validIds = new Set<string>();
  for (const e of candidates) for (const b of e.bullets.slice(0, CANDIDATES_PER_EXPERIENCE)) validIds.add(b.bulletId);

  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const q = query({
      prompt: buildPrompt(jd, jobTitle, candidates),
      options: {
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        allowedTools: [],
        systemPrompt:
          "You are a precise résumé-tailoring assistant. You select and order the " +
          "applicant's existing approved bullets. You never fabricate experience. " +
          "You reply with a single JSON object and nothing else.",
        ...(process.env.HUB_TAILOR_MODEL ? { model: process.env.HUB_TAILOR_MODEL } : {}),
      },
    });

    let text = "";
    for await (const message of q as AsyncIterable<Record<string, unknown>>) {
      const blocks = (message.content as Array<Record<string, unknown>> | undefined) ?? [];
      for (const b of blocks) if (b.type === "text" && typeof b.text === "string") text += b.text;
      if (message.type === "result" && typeof message.result === "string") text += message.result;
    }
    if (!text.trim()) return null;
    return coerce(extractJson(text), validIds);
  } catch (err) {
    console.warn("[tailor] Claude Agent SDK unavailable/failed, using deterministic fallback:", (err as Error).message);
    return null;
  }
}
