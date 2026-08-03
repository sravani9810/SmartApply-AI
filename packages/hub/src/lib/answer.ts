import { eq, like } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { stripHtml } from "./tags";
import { logWarn } from "./log";

export interface FieldRequest {
  label: string;
  type?: string;
  options?: string[]; // for select/radio
}

/** Build a compact applicant profile from the library for grounding answers. */
function applicantContext(): string {
  const p = db.select().from(s.profile).where(eq(s.profile.id, "me")).get()?.data;
  const summary = db.select().from(s.summarySnippets).orderBy(s.summarySnippets.ord).all().map((x) => x.text);
  const skills = db.select().from(s.skills).orderBy(s.skills.ord).all().map((x) => x.name);

  // Experiences with a few approved bullets each, so Claude can answer
  // substance questions ("describe your experience with X"), not just headers.
  const expRows = db.select().from(s.experiences).orderBy(s.experiences.kind, s.experiences.ord).all();
  const exps = expRows.map((e) => {
    const bulletRows = db.select().from(s.bullets)
      .where(eq(s.bullets.experienceId, e.id)).orderBy(s.bullets.ord).all()
      .filter((b) => b.approved).slice(0, 3);
    const bullets = bulletRows.map((b) => {
      const v = db.select().from(s.bulletVariants).where(eq(s.bulletVariants.bulletId, b.id))
        .orderBy(s.bulletVariants.isPrimary).all();
      return (v.find((x) => x.isPrimary)?.text ?? v[0]?.text ?? "").trim();
    }).filter(Boolean);
    const header = `- ${e.title} @ ${e.company} (${e.start}–${e.end})`;
    return bullets.length ? `${header}\n${bullets.map((b) => `  • ${b}`).join("\n")}` : header;
  });

  const edu = db.select().from(s.education).orderBy(s.education.ord).all()
    .map((e) => `- ${e.degree}, ${e.university} (${e.start}–${e.end})`);

  return [
    p ? `Name: ${p.name}` : "",
    p?.email ? `Email: ${p.email}` : "",
    summary.length ? `Summary:\n${summary.join("\n")}` : "",
    skills.length ? `Skills: ${skills.join(", ")}` : "",
    exps.length ? `Experience:\n${exps.join("\n")}` : "",
    edu.length ? `Education:\n${edu.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

/**
 * Answers the user has previously typed into forms (label → value), so Claude
 * can reuse them for the same or paraphrased questions.
 */
function learnedContext(limit = 80): string {
  const rows = db.select().from(s.learnedAnswers).limit(limit).all();
  if (rows.length === 0) return "";
  return rows.map((r) => `- "${r.label}": ${r.value}`).join("\n");
}

/** Find a job by exact URL or by Indeed jk, for JD grounding. */
function jdForUrl(url?: string): string {
  if (!url) return "";
  const exact = db.select().from(s.jobs).where(eq(s.jobs.url, url)).get();
  if (exact?.description) return exact.description;
  const jk = /[?&]jk=([0-9a-z]+)/i.exec(url)?.[1];
  if (jk) {
    const j = db.select().from(s.jobs).where(like(s.jobs.url, `%jk=${jk}%`)).get();
    if (j?.description) return j.description;
  }
  return "";
}

function buildPrompt(fields: FieldRequest[], jd: string): string {
  const list = fields.map((f, i) => {
    const opts = f.options?.length ? ` (choose one of: ${f.options.join(" | ")})` : "";
    return `${i + 1}. [${f.type ?? "text"}] ${f.label}${opts}`;
  }).join("\n");
  const learned = learnedContext();
  return `You are helping an applicant answer job-application form questions, using ONLY \
the factual context below about them. Do not invent facts (employers, dates, degrees, \
visa/work-authorization status, salary, personal identifiers). If a question needs \
information not present in the context, return an empty string for it.

APPLICANT CONTEXT:
${applicantContext()}

${learned ? `PREVIOUSLY ANSWERED QUESTIONS (answers the applicant gave on past forms — reuse the value when a form question below is the same question or a clear paraphrase; adapt wording/format to fit, but never contradict these):\n${learned}\n` : ""}
${jd ? `JOB DESCRIPTION (for tone/relevance):\n${stripHtml(jd).slice(0, 4000)}\n` : ""}
FORM QUESTIONS:
${list}

Return ONLY a JSON array of the same length, each item {"label": <the exact label>, "answer": <string>}. \
For free-text questions write a concise, truthful answer grounded in the context or a previous answer; \
for choice questions return exactly one of the given options or "" if unsure.`;
}

/** Ask Claude (subscription) to answer unmatched form fields. Returns {} if unavailable. */
export async function answerFields(fields: FieldRequest[], url?: string): Promise<Record<string, string>> {
  if (process.env.HUB_DISABLE_CLAUDE === "1" || fields.length === 0) return {};
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const q = query({
      prompt: buildPrompt(fields, jdForUrl(url)),
      options: {
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        allowedTools: [],
        systemPrompt:
          "You answer job-application questions truthfully from the applicant's provided " +
          "context only. You never fabricate personal facts. You reply with a JSON array only.",
        ...(process.env.HUB_TAILOR_MODEL ? { model: process.env.HUB_TAILOR_MODEL } : {}),
      },
    });
    let text = "";
    for await (const m of q as AsyncIterable<Record<string, unknown>>) {
      for (const b of (m.content as Array<Record<string, unknown>> | undefined) ?? [])
        if (b.type === "text" && typeof b.text === "string") text += b.text;
      if (m.type === "result" && typeof m.result === "string") text += m.result;
    }
    const start = text.indexOf("["), end = text.lastIndexOf("]");
    if (start === -1 || end <= start) return {};
    const arr = JSON.parse(text.slice(start, end + 1)) as Array<{ label?: string; answer?: string }>;
    const out: Record<string, string> = {};
    for (const it of arr) if (it.label && typeof it.answer === "string" && it.answer.trim()) out[it.label] = it.answer;
    return out;
  } catch (err) {
    logWarn("answer", `Claude unavailable: ${(err as Error).message}`);
    return {};
  }
}
