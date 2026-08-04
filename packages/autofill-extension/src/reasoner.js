// Pluggable reasoning for the Auto-pilot: answers form fields the deterministic
// matcher couldn't, using a FAST local model first and escalating only the
// leftovers to Claude.
//
//   backend "auto"  → chrome built-in (Gemini Nano) → Ollama (Gemma) → Claude
//   backend "ollama"|"chrome"|"claude" → that backend only
//
// Imported by the background service worker (an ES-module worker), so `import`
// is allowed here — unlike content.js.

import { alog } from "./log.js";

const SYSTEM =
  "You help an applicant answer job-application form questions using ONLY the " +
  "factual context provided about them. Never invent employers, dates, degrees, " +
  "work-authorization/visa status, salary, or identifiers. If a field can't be " +
  "answered from the context, return an empty string for it. Reply with JSON only.";

// --- Context selection -------------------------------------------------------
//
// Everything below exists to send only what the questions actually need. The
// previous version sent the whole profile, the whole résumé and an arbitrary
// first-60 slice of learned answers on every call: ~17k characters to ask two
// questions. That is both a privacy problem (home address and EEO answers went
// out to answer "middle name") and an accuracy one — a 4096-token local model
// spent most of its window on preamble before reaching the field list.

const STOP = new Set([
  "the", "a", "an", "of", "to", "your", "you", "is", "are", "in", "for", "and", "or",
  "please", "select", "enter", "what", "which", "do", "does", "did", "this", "that",
  "with", "on", "at", "by", "have", "has", "be", "if", "any", "all", "we", "us", "our",
  "from", "about", "will", "would", "can", "may", "there", "their", "it", "as",
]);

function tokens(text) {
  return (text || "")
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** How many distinct tokens an item shares with what's being asked. */
function overlap(text, asked) {
  let n = 0;
  for (const w of new Set(tokens(text))) if (asked.has(w)) n++;
  return n;
}

/** True when any of `words` appears in the asked-about text. */
const wants = (asked, words) => words.some((w) => asked.has(w));

// Profile keys carry meaning the key name alone doesn't always spell out.
const PROFILE_HINTS = {
  firstName: "first name given legal",
  lastName: "last name surname family legal",
  email: "email mail contact",
  phone: "phone mobile telephone cell contact number",
  address: "address street residential mailing location",
  city: "city town address location",
  state: "state province region address",
  zipcode: "zip postal postcode pin code address",
  country: "country nation nationality citizen location",
  linkedin: "linkedin profile url link social",
  website: "website portfolio url link personal site",
  currentCompany: "current company employer organisation organization work",
  currentTitle: "current title role position designation job occupation work",
  yearsExperience: "years experience total duration seniority",
  workAuthorized: "authorized authorised eligible work authorization visa legally permit",
  requiresSponsorship: "sponsorship visa require need immigration",
  gender: "gender sex identity",
  veteranStatus: "veteran military service armed",
  disabilityStatus: "disability disabled impairment accommodation",
};

const LONG_FORM = ["describe", "why", "tell", "explain", "cover", "letter", "summary",
  "introduce", "yourself", "motivation", "interest", "additional", "comments", "note"];
// Deliberately no bare "work": it appears in "authorized to work" and "willing
// to relocate for work", which are not questions about your job history.
const EXPERIENCE_WORDS = ["experience", "employer", "employment", "company", "role", "position",
  "job", "history", "project", "achievement", "responsibility", "title", "years", "worked"];
const EDUCATION_WORDS = ["education", "degree", "school", "university", "college", "graduate",
  "graduation", "major", "study", "qualification", "institution", "gpa"];
const SKILL_WORDS = ["skill", "skills", "technology", "technologies", "tool", "tools", "stack",
  "framework", "language", "languages", "proficiency", "expertise", "competency"];

const MAX_LEARNED = 12;

/**
 * Grounding context scoped to `fields`. Sections are included only when the
 * questions point at them; learned answers are ranked by token overlap instead
 * of taken in insertion order, so the ones that survive are the ones that might
 * actually answer something.
 */
function contextBlock(ctx, fields = []) {
  const asked = new Set(
    fields.flatMap((f) => [...tokens(f.label), ...tokens((f.options || []).join(" "))]),
  );
  const longForm = fields.some(
    (f) => f.type === "textarea" || wants(new Set(tokens(f.label)), LONG_FORM),
  );

  // Name is near-free and underpins many composed answers ("full name",
  // "signature"); everything else has to earn its place.
  const profile = Object.entries(ctx.profile || {})
    .filter(([k, v]) => {
      if (!v) return false;
      if (k === "firstName" || k === "lastName") return true;
      return overlap(`${k} ${PROFILE_HINTS[k] || ""}`, asked) > 0;
    })
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const r = ctx.resume || {};
  const wantExp = longForm || wants(asked, EXPERIENCE_WORDS);
  const wantEdu = wants(asked, EDUCATION_WORDS);
  const wantSkills = longForm || wants(asked, SKILL_WORDS);

  // Bullets are the bulk of the résumé — only worth their size when the answer
  // has to be prose. A "years of experience" field just needs the headers.
  const experience = wantExp
    ? (r.experiences || []).map((e) => {
        const header = `- ${e.title} @ ${e.company} (${e.start}–${e.end})`;
        if (!longForm) return header;
        const bullets = (e.bullets || []).slice(0, 3).map((b) => `  • ${b}`).join("\n");
        return bullets ? `${header}\n${bullets}` : header;
      }).join("\n")
    : "";

  const education = wantEdu
    ? (r.education || []).map((e) => `- ${e.degree}, ${e.university} (${e.start}–${e.end})`).join("\n")
    : "";

  const learned = Object.entries(ctx.learned || {})
    .map(([k, v]) => ({ k, v, score: overlap(k, asked) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LEARNED)
    .map((x) => `- "${x.k}": ${x.v}`)
    .join("\n");

  return [
    profile && `APPLICANT PROFILE:\n${profile}`,
    longForm && r.summary?.length && `SUMMARY:\n${r.summary.join("\n")}`,
    wantSkills && r.skills?.length && `SKILLS: ${r.skills.join(", ")}`,
    experience && `EXPERIENCE:\n${experience}`,
    education && `EDUCATION:\n${education}`,
    learned && `PREVIOUSLY ANSWERED (reuse when a question is the same or a paraphrase):\n${learned}`,
  ].filter(Boolean).join("\n\n");
}

/** The field list, addressed by stable key so answers map back unambiguously. */
function fieldList(fields) {
  return fields.map((f) => {
    const opts = f.options?.length ? ` (choose exactly one of: ${f.options.join(" | ")})` : "";
    return `${f.key} [${f.type}] ${f.label}${opts}`;
  }).join("\n");
}

function buildUserPrompt(fields, ctx) {
  return `${contextBlock(ctx, fields)}

FORM FIELDS (key [type] label):
${fieldList(fields)}

Return a JSON object mapping each field key to your answer string, e.g. {"sa0":"...","sar1":"..."}. \
For choice fields return exactly one of the listed options, or "" if unsure. \
Only include keys you can answer truthfully from the context; omit or use "" otherwise.`;
}

/** Pull the first {...} JSON object out of a model response and normalize it. */
function parseAnswers(text, fields) {
  if (!text) return {};
  let obj;
  try {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s !== -1 && e > s) obj = JSON.parse(text.slice(s, e + 1));
  } catch {
    // Some models return an array of {key, answer}.
    try {
      const s = text.indexOf("["), e = text.lastIndexOf("]");
      if (s !== -1 && e > s) {
        const arr = JSON.parse(text.slice(s, e + 1));
        obj = {};
        for (const it of arr) if (it?.key) obj[it.key] = it.answer;
      }
    } catch { /* give up */ }
  }
  if (!obj || typeof obj !== "object") return {};
  const valid = new Set(fields.map((f) => f.key));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (valid.has(k) && typeof v === "string" && v.trim() && !isNonAnswer(v)) out[k] = v.trim();
  }
  return out;
}

// Models are told to return "" when they can't answer; smaller ones often write
// a placeholder instead. Typing "Unanswerable" into an application is worse than
// leaving the field blank, so treat these as no answer.
const NON_ANSWERS = new Set([
  "unanswerable", "unknown", "n/a", "na", "none", "not applicable", "not specified",
  "not provided", "not available", "no answer", "null", "undefined", "-", "--",
  "no information", "not mentioned", "insufficient information", "cannot answer",
]);

function isNonAnswer(v) {
  return NON_ANSWERS.has(v.trim().toLowerCase().replace(/[.!]+$/, ""));
}

function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

// ---- Backend: Ollama (local Gemma) -----------------------------------------

// Goes through the hub, not straight to :11434. Ollama refuses
// chrome-extension:// origins with a 403; the hub is a server and is not
// subject to that check. The hub owns the Ollama endpoint (OLLAMA_URL), so
// only the model name travels from here.
async function ollamaAnswer(fields, ctx, settings) {
  const base = (ctx.hubUrl || "http://localhost:3100").replace(/\/+$/, "");
  const model = settings.ollamaModel || "gemma3:1b";
  // Roomy enough for a small model's cold load (and a warm large one), but
  // short enough that a wedged backend escalates to Claude rather than
  // stalling the Auto-pilot.
  const t = withTimeout(90000);
  try {
    const res = await fetch(`${base}/api/local-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: t.signal,
      body: JSON.stringify({
        model,
        format: "json",
        // Reasoning models (gemma4) otherwise emit a long chain-of-thought
        // before answering — minutes per step for no gain on this task.
        // Ignored by models that don't support thinking.
        think: false,
        // Keep the model resident between steps so only the first call pays
        // the load cost; an application form is many calls in a row.
        keep_alive: "10m",
        options: { temperature: 0 },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: buildUserPrompt(fields, ctx) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`hub local-model ${res.status}`);
    const j = await res.json();
    if (!j?.ok) throw new Error(j?.error || "local model unavailable");
    return parseAnswers(j.content || "", fields);
  } finally {
    t.done();
  }
}

// ---- Backend: Chrome built-in (Gemini Nano) --------------------------------

/** Reject after `ms` so a hung built-in call escalates instead of stalling. */
function raceTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

async function chromeAnswer(fields, ctx) {
  const LM = globalThis.LanguageModel;
  if (!LM?.availability) throw new Error("chrome built-in AI unavailable");

  const avail = await raceTimeout(LM.availability(), 5000, "chrome availability timed out");
  // Only "available" is safe to use. "downloadable"/"downloading" mean
  // LM.create() would block on a multi-GB Gemini Nano download — mid-application
  // is the wrong moment for that, so fall through to the next backend instead.
  if (avail !== "available") throw new Error(`chrome built-in AI ${avail || "unavailable"}`);

  const session = await raceTimeout(
    LM.create({ initialPrompts: [{ role: "system", content: SYSTEM }] }),
    15000,
    "chrome session create timed out",
  );
  try {
    const text = await raceTimeout(
      session.prompt(buildUserPrompt(fields, ctx)),
      45000,
      "chrome prompt timed out",
    );
    return parseAnswers(text, fields);
  } finally {
    session.destroy?.();
  }
}

// ---- Backend: Claude via the Hub -------------------------------------------

async function claudeAnswer(fields, ctx) {
  const base = (ctx.hubUrl || "http://localhost:3100").replace(/\/+$/, "");
  const t = withTimeout(90000);
  try {
    const res = await fetch(`${base}/api/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: t.signal,
      body: JSON.stringify({
        url: ctx.url,
        fields: fields.map((f) => ({ label: f.label, type: f.type, options: f.options })),
      }),
    });
    if (!res.ok) throw new Error(`hub ${res.status}`);
    const answers = (await res.json()).answers || {};
    // The hub keys answers by label; map them back to our stable field keys.
    const out = {};
    for (const f of fields) {
      const v = answers[f.label];
      if (typeof v === "string" && v.trim()) out[f.key] = v.trim();
    }
    return out;
  } finally {
    t.done();
  }
}

const BACKENDS = { ollama: ollamaAnswer, chrome: chromeAnswer, claude: claudeAnswer };

/**
 * Answer unresolved fields. Tries backends in order, escalating only the
 * fields still unanswered to the next backend. Consent/terms fields are never
 * auto-answered. Returns { answersByKey, meta }.
 */
export async function reason(fields, ctx, settings = {}) {
  const pending = (fields || []).filter((f) => !f.consent && !f.filled);
  if (pending.length === 0) return { answersByKey: {}, meta: { used: [], unresolved: [] } };

  const backend = settings.reasonerBackend || "auto";
  const order = backend === "auto" ? ["chrome", "ollama", "claude"] : [backend];

  const answersByKey = {};
  const used = [];
  let remaining = pending;

  for (const name of order) {
    if (remaining.length === 0) break;
    const t0 = Date.now();
    try {
      const got = await BACKENDS[name](remaining, ctx, settings);
      let n = 0;
      for (const [k, v] of Object.entries(got)) {
        if (!(k in answersByKey)) { answersByKey[k] = v; n++; }
      }
      if (n) used.push(`${name}:${n}`);
      alog("info", "reasoner", `${name} answered ${n}/${remaining.length} in ${Date.now() - t0}ms`);
      remaining = remaining.filter((f) => !(f.key in answersByKey));
    } catch (err) {
      used.push(`${name}:skip`); // backend unavailable — fall through to the next
      alog("warn", "reasoner", `${name} unavailable, falling through`, { error: err.message });
    }
  }

  if (remaining.length) {
    alog("warn", "reasoner", `${remaining.length} field(s) unanswered`, {
      labels: remaining.map((f) => f.label).slice(0, 12),
    });
  }
  return { answersByKey, meta: { used, unresolved: remaining.map((f) => f.key) } };
}
