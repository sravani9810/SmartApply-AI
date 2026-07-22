import { eq } from "drizzle-orm";
import type { ResumeData } from "@smartapply/shared";
import { db } from "../db/client";
import * as s from "../db/schema";
import { stripHtml } from "./tags";
import { logWarn } from "./log";
import { compile } from "./compile";
import type { Selection } from "./compile";

export interface ComposeInput {
  /** Pasted job description the résumé targets (optional — can compose from instructions alone). */
  jd?: string;
  /** Free-form edit directives: "add Kubernetes", "remove the Acme role", "target internship". */
  instructions?: string;
  /** Optional base flavor to seed the selection from. */
  flavorId?: string;
  /** Optional explicit target role framing ("internship", "senior backend"). */
  targetRole?: string;
  /** When refining an already-composed résumé, its current state to build on. */
  current?: ComposeState;
  /** Instructions already applied in earlier turns, for context on a follow-up. */
  priorInstructions?: string[];
}

/** The mutable pieces of a composed résumé, carried between follow-up turns. */
export interface ComposeState {
  selection: Record<string, string[]>;
  skills: string[];
  summary: string[];
}

export interface ComposeMeta {
  company: string;
  domain: string;
  technologies: string[];
  targetRole: string;
}

export interface ComposeOutcome {
  resumeData: ResumeData;
  meta: ComposeMeta;
  usedClaude: boolean;
  /** Carry this back into the next follow-up as `input.current`. */
  state: ComposeState;
}

interface CandidateExp {
  experienceId: string;
  title: string;
  company: string;
  kind: "work" | "project";
  bullets: { bulletId: string; text: string }[];
}

const CANDIDATES_PER_EXPERIENCE = 10;

/** All approved bullets grouped by experience — the raw material Claude may pick from. */
function candidates(): CandidateExp[] {
  const exps = db.select().from(s.experiences).orderBy(s.experiences.ord).all();
  return exps.map((e): CandidateExp => {
    const bulletRows = db.select().from(s.bullets).where(eq(s.bullets.experienceId, e.id)).all()
      .filter((b) => b.approved);
    const bullets = bulletRows.map((b) => {
      const variants = db.select().from(s.bulletVariants)
        .where(eq(s.bulletVariants.bulletId, b.id)).all();
      const text = variants.find((v) => v.isPrimary)?.text ?? variants[0]?.text ?? "";
      return { bulletId: b.id, text: stripHtml(text) };
    }).filter((b) => b.text);
    return {
      experienceId: e.id,
      title: e.title,
      company: e.company,
      kind: e.kind === "project" ? "project" : "work",
      bullets: bullets.slice(0, CANDIDATES_PER_EXPERIENCE),
    };
  }).filter((e) => e.bullets.length > 0);
}

function currentSkills(): string[] {
  return db.select().from(s.skills).orderBy(s.skills.ord).all().map((x) => x.name);
}

function currentSummary(): string[] {
  return db.select().from(s.summarySnippets).orderBy(s.summarySnippets.ord).all().map((x) => x.text);
}

// ── Claude output contract ───────────────────────────────────────────────────
interface ComposePlan {
  selection: Record<string, string[]>;
  dropExperienceIds: string[];
  skills: string[];
  summary: string[];
  meta: ComposeMeta;
}

function buildPrompt(input: ComposeInput, cands: CandidateExp[], skills: string[], summary: string[]): string {
  const sections = cands.map((e) => {
    const lines = e.bullets.map((b) => `    - id=${b.bulletId} :: ${b.text}`).join("\n");
    return `  Experience ${e.experienceId} — ${e.title} @ ${e.company} (${e.kind}):\n${lines}`;
  }).join("\n\n");

  const refining = !!input.current;
  const currentSel = input.current?.selection ?? {};
  const currentSelBlock = Object.entries(currentSel)
    .map(([expId, ids]) => `  ${expId}: [${ids.join(", ")}]`).join("\n") || "  (none)";
  const priorBlock = (input.priorInstructions ?? []).filter(Boolean).map((p, i) => `  ${i + 1}. ${p}`).join("\n");

  const intro = refining
    ? `You are REFINING an already-composed résumé for a candidate. Below is the résumé's \
CURRENT state (its selected bullets, skills, and summary). Apply ONLY the NEW INSTRUCTION, \
changing what it asks and keeping everything else as-is. You must NOT invent, rewrite, or \
fabricate work experience — bullets may ONLY be chosen from the candidate ids below \
(you may add back or reorder any of them). Skills and the summary may be edited freely.`
    : `You are composing a tailored résumé for a candidate by (1) SELECTING and ORDERING \
the candidate's own already-written, approved bullet points, and (2) applying the \
candidate's explicit edit instructions to the skills list and summary. You must NOT \
invent, rewrite, or fabricate work experience — bullets may ONLY be chosen from the \
candidate ids below. Skills and the summary may be edited freely because the candidate \
is directing their own résumé.`;

  return `${intro}

${input.jd ? `JOB DESCRIPTION:\n${input.jd.slice(0, 8000)}\n` : "JOB DESCRIPTION: (none provided)\n"}
${input.targetRole ? `TARGET ROLE: ${input.targetRole}\n` : ""}${
    refining && priorBlock ? `\nINSTRUCTIONS ALREADY APPLIED IN EARLIER TURNS (do not redo — for context only):\n${priorBlock}\n` : ""
  }${refining ? `\nCURRENTLY SELECTED BULLETS (experienceId: [bulletIds] — this is what the résumé has now):\n${currentSelBlock}\n` : ""}
${refining ? "NEW INSTRUCTION TO APPLY NOW" : "EDIT INSTRUCTIONS FROM THE CANDIDATE"}:
${(input.instructions ?? "").slice(0, 2000) || "(none — just tailor to the JD)"}

CURRENT SKILLS (edit per the instruction — add/remove/reorder as asked, else keep):
${skills.join(", ") || "(none)"}

CURRENT SUMMARY PARAGRAPHS (reframe only if the instruction asks, else keep):
${summary.map((p, i) => `  ${i + 1}. ${p}`).join("\n") || "(none)"}

CANDIDATE BULLETS (choose only from these ids):
${sections}

Return ONLY a single JSON object (no prose, no markdown fences) with this exact shape:
{
  "selection": { "<experienceId>": ["<bulletId>", ...ordered best-first], ... },
  "dropExperienceIds": [<experienceIds to omit entirely, e.g. a company the candidate asked to remove>],
  "skills": [<the final skill lines/tokens after applying add/remove instructions>],
  "summary": [<1-2 reframed summary paragraphs targeting the role; [] to omit>],
  "meta": {
    "company": "<company the JD is for, or "" if unknown>",
    "domain": "<one of: frontend, backend, sde, cloud, data, ml, or a short domain word>",
    "technologies": [<the 4-8 main technologies this résumé emphasizes>],
    "targetRole": "<the role framing, e.g. "internship" or "senior backend">"
  }
}

Rules:
- For each experience include only its 4-6 most relevant bullet ids (fewer if weak).
- Use only bullet ids that appear above; never emit an id from a different experience.
- If the instructions say to remove/exclude a company or role, put its experienceId in dropExperienceIds and omit it from selection.
- When the instructions say "add <tech>", include that tech in "skills". When they say "remove <tech>", drop it from "skills".`;
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}

function coerce(raw: unknown, validIds: Set<string>, fallbackSkills: string[]): ComposePlan {
  const o = raw as Record<string, unknown>;
  const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

  const selRaw = (o.selection ?? {}) as Record<string, unknown>;
  const selection: Record<string, string[]> = {};
  for (const [expId, ids] of Object.entries(selRaw)) {
    if (!Array.isArray(ids)) continue;
    const kept = ids.filter((id): id is string => typeof id === "string" && validIds.has(id));
    if (kept.length) selection[expId] = kept;
  }
  if (Object.keys(selection).length === 0) throw new Error("empty/invalid selection");

  const m = (o.meta ?? {}) as Record<string, unknown>;
  return {
    selection,
    dropExperienceIds: strArr(o.dropExperienceIds),
    skills: strArr(o.skills).length ? strArr(o.skills) : fallbackSkills,
    summary: strArr(o.summary),
    meta: {
      company: typeof m.company === "string" ? m.company : "",
      domain: typeof m.domain === "string" ? m.domain : "",
      technologies: strArr(m.technologies),
      targetRole: typeof m.targetRole === "string" ? m.targetRole : "",
    },
  };
}

/** Ask Claude (subscription, Agent SDK) to compose. Returns null → deterministic fallback. */
async function planWithClaude(
  input: ComposeInput, cands: CandidateExp[], skills: string[], summary: string[],
): Promise<ComposePlan | null> {
  if (process.env.HUB_DISABLE_CLAUDE === "1") return null;
  const validIds = new Set<string>();
  for (const e of cands) for (const b of e.bullets) validIds.add(b.bulletId);

  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const q = query({
      prompt: buildPrompt(input, cands, skills, summary),
      options: {
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        allowedTools: [],
        systemPrompt:
          "You are a precise résumé composer. You select and order the candidate's " +
          "existing approved bullets and apply their edit instructions to skills and " +
          "summary. You never fabricate work experience. You reply with a single JSON " +
          "object and nothing else.",
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
    return coerce(extractJson(text), validIds, skills);
  } catch (err) {
    logWarn("compose", `Claude unavailable, using deterministic fallback: ${(err as Error).message}`);
    return null;
  }
}

// ── Deterministic fallback ───────────────────────────────────────────────────
const FALLBACK_PER_EXPERIENCE = 6;

/** Parse simple "add X" / "remove X" directives out of the free-form instructions. */
function parseDirectives(instructions: string) {
  const add: string[] = [];
  const remove: string[] = [];
  for (const raw of instructions.split(/[\n,;]+/)) {
    const line = raw.trim();
    let mm: RegExpMatchArray | null;
    if ((mm = line.match(/^\+?\s*add\s+(.+)$/i))) add.push(mm[1].trim());
    else if ((mm = line.match(/^-?\s*(?:remove|drop|delete)\s+(.+)$/i))) remove.push(mm[1].trim());
  }
  return { add, remove };
}

function deterministic(input: ComposeInput, cands: CandidateExp[], skills: string[], summary: string[]): ComposePlan {
  const flavorSel = input.flavorId
    ? new Set(db.select().from(s.flavorBullets).where(eq(s.flavorBullets.flavorId, input.flavorId)).all().map((r) => r.bulletId))
    : null;

  const { add, remove } = parseDirectives(input.instructions ?? "");
  const removeLc = remove.map((r) => r.toLowerCase());

  // Drop experiences whose company/title the instructions asked to remove.
  const dropExperienceIds = cands
    .filter((e) => removeLc.some((r) => e.company.toLowerCase().includes(r) || e.title.toLowerCase().includes(r)))
    .map((e) => e.experienceId);
  const dropSet = new Set(dropExperienceIds);

  const currentSel = input.current?.selection;
  const selection: Record<string, string[]> = {};
  for (const e of cands) {
    if (dropSet.has(e.experienceId)) continue;
    let ids: string[];
    if (currentSel) {
      // Refining: keep the current selection for this experience as-is.
      const validForExp = new Set(e.bullets.map((b) => b.bulletId));
      ids = (currentSel[e.experienceId] ?? []).filter((id) => validForExp.has(id));
    } else {
      let pool = e.bullets;
      if (flavorSel) {
        const preferred = pool.filter((b) => flavorSel.has(b.bulletId));
        if (preferred.length) pool = preferred;
      }
      ids = pool.slice(0, FALLBACK_PER_EXPERIENCE).map((b) => b.bulletId);
    }
    if (ids.length) selection[e.experienceId] = ids;
  }

  // Apply add/remove to the skills list (token-level).
  let outSkills = skills.filter((sk) => !removeLc.some((r) => sk.toLowerCase().includes(r)));
  for (const a of add) if (!outSkills.some((sk) => sk.toLowerCase() === a.toLowerCase())) outSkills.push(a);

  const technologies = [...add, ...outSkills].slice(0, 8);
  return {
    selection,
    dropExperienceIds,
    skills: outSkills,
    summary,
    meta: {
      company: "",
      domain: input.flavorId
        ? (db.select().from(s.flavors).where(eq(s.flavors.id, input.flavorId)).get()?.name ?? "")
        : "",
      technologies,
      targetRole: input.targetRole ?? "",
    },
  };
}

/**
 * Compose a résumé: pick/order the candidate's approved bullets and apply their
 * edit instructions to skills/summary, via Claude (subscription) with a
 * deterministic fallback. Returns a ready-to-render ResumeData + library metadata.
 */
export async function composeResume(input: ComposeInput): Promise<ComposeOutcome> {
  const cands = candidates();
  // When refining, build on the résumé's current state; otherwise start from the library.
  const skills = input.current?.skills ?? currentSkills();
  const summary = input.current?.summary ?? currentSummary();

  const plan = await planWithClaude(input, cands, skills, summary);
  const usedClaude = plan !== null;
  const p = plan ?? deterministic(input, cands, skills, summary);
  if (input.targetRole && !p.meta.targetRole) p.meta.targetRole = input.targetRole;

  // Compile a base ResumeData from the selection, then apply the plan's overrides.
  const selection: Selection = new Map(Object.entries(p.selection));
  const base = compile(input.flavorId ?? "", selection);
  const drop = new Set(p.dropExperienceIds);
  // dropExperienceIds are ids; compile already filtered to selected experiences,
  // but honor an explicit drop by company name too (Claude may name it there).
  const dropNames = cands.filter((e) => drop.has(e.experienceId)).map((e) => e.company.toLowerCase());
  const keep = (entryCompany: string) => !dropNames.includes(entryCompany.toLowerCase());

  const resumeData: ResumeData = {
    ...base,
    skills: p.skills.length ? chunkSkills(p.skills) : base.skills,
    summary: p.summary.length ? p.summary : base.summary,
    work_experience: base.work_experience.filter((e) => keep(e.company)),
    projects: (base.projects ?? []).filter((e) => keep(e.company)),
  };

  return {
    resumeData,
    meta: p.meta,
    usedClaude,
    state: { selection: p.selection, skills: p.skills, summary: p.summary },
  };
}

/**
 * Reconstruct a refinable ComposeState from an already-compiled ResumeData by
 * matching each rendered bullet back to its library bullet id. Lets a saved
 * résumé (composed or auto-tailored) be refined without persisting the plan.
 */
export function deriveState(resume: ResumeData): ComposeState {
  const norm = (t: string) => stripHtml(t).toLowerCase().replace(/\s+/g, " ").trim();

  const index = new Map<string, { experienceId: string; bulletId: string }>();
  for (const e of db.select().from(s.experiences).all()) {
    for (const b of db.select().from(s.bullets).where(eq(s.bullets.experienceId, e.id)).all()) {
      const variants = db.select().from(s.bulletVariants).where(eq(s.bulletVariants.bulletId, b.id)).all();
      const text = variants.find((v) => v.isPrimary)?.text ?? variants[0]?.text ?? "";
      const key = norm(text);
      if (key) index.set(key, { experienceId: e.id, bulletId: b.id });
    }
  }

  const selection: Record<string, string[]> = {};
  const entries = [...(resume.work_experience ?? []), ...(resume.projects ?? [])];
  for (const entry of entries) {
    for (const d of entry.description) {
      const hit = index.get(norm(d));
      if (hit) (selection[hit.experienceId] ??= []).push(hit.bulletId);
    }
  }

  const skills = (resume.skills ?? []).flatMap((l) => l.split("|").map((x) => x.trim())).filter(Boolean);
  return { selection, skills, summary: resume.summary ?? [] };
}

/** Pack skill tokens into pipe-joined lines when Claude returns a flat token list. */
function chunkSkills(skills: string[], perLine = 15): string[] {
  // If the model already returned full lines (containing "|"), keep them as-is.
  if (skills.some((sk) => sk.includes("|"))) return skills;
  const lines: string[] = [];
  for (let i = 0; i < skills.length; i += perLine) lines.push(skills.slice(i, i + perLine).join(" | "));
  return lines;
}
