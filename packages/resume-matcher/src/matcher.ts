import Anthropic from "@anthropic-ai/sdk";
import type { MatchResult } from "@smartapply/shared";

/** Default model — the latest, most capable Claude model at time of writing. */
const MODEL = "claude-opus-4-8";

export interface MatchOptions {
  /** When true, also return a tailored version of the resume for this JD. */
  tailor?: boolean;
  /** Override the model id. */
  model?: string;
}

/**
 * Score a resume against a job description using Claude, and optionally tailor
 * the resume to the JD. Returns a structured MatchResult.
 *
 * Requires ANTHROPIC_API_KEY in the environment (or an `ant auth login`
 * profile).
 */
export async function matchResume(
  resume: string,
  jobDescription: string,
  options: MatchOptions = {},
): Promise<MatchResult> {
  const client = new Anthropic();
  const model = options.model ?? MODEL;

  const tailorLine = options.tailor
    ? 'Also include "tailoredResume": the resume rewritten to emphasize relevant experience for this JD without inventing facts.'
    : "";

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          "You are a resume/job-description matcher. Compare the RESUME to the JOB DESCRIPTION.",
          "Respond with ONLY a JSON object (no prose, no code fences) with keys:",
          '  "fitScore" (number 0-1), "matchedSkills" (string[]), "missingSkills" (string[]), "summary" (string)' +
            (options.tailor ? ', "tailoredResume" (string)' : "") +
            ".",
          "matchedSkills = JD skills present in the resume; missingSkills = JD skills absent from it.",
          tailorLine,
          "",
          "=== RESUME ===",
          resume,
          "",
          "=== JOB DESCRIPTION ===",
          jobDescription,
        ].join("\n"),
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("resume-matcher: model returned no text block");
  }
  return parseJson(text.text);
}

/** Extract the JSON object from the model's reply, tolerating stray fences. */
function parseJson(raw: string): MatchResult {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`resume-matcher: no JSON object in response: ${raw.slice(0, 200)}`);
  }
  return JSON.parse(raw.slice(start, end + 1)) as MatchResult;
}
