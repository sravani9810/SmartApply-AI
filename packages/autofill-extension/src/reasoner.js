// Pluggable reasoning for the Auto-pilot: answers form fields the deterministic
// matcher couldn't, using a FAST local model first and escalating only the
// leftovers to Claude.
//
//   backend "auto"  → chrome built-in (Gemini Nano) → Ollama (Gemma) → Claude
//   backend "ollama"|"chrome"|"claude" → that backend only
//
// Imported by the background service worker (an ES-module worker), so `import`
// is allowed here — unlike content.js.

const SYSTEM =
  "You help an applicant answer job-application form questions using ONLY the " +
  "factual context provided about them. Never invent employers, dates, degrees, " +
  "work-authorization/visa status, salary, or identifiers. If a field can't be " +
  "answered from the context, return an empty string for it. Reply with JSON only.";

/** Compact grounding context from the synced profile + learned answers. */
function contextBlock(ctx) {
  const profile = Object.entries(ctx.profile || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const learned = Object.entries(ctx.learned || {})
    .slice(0, 60)
    .map(([k, v]) => `- "${k}": ${v}`)
    .join("\n");
  return [
    profile && `APPLICANT PROFILE:\n${profile}`,
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
  return `${contextBlock(ctx)}

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
    if (valid.has(k) && typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

// ---- Backend: Ollama (local Gemma) -----------------------------------------

async function ollamaAnswer(fields, ctx, settings) {
  const url = (settings.ollamaUrl || "http://localhost:11434").replace(/\/+$/, "");
  const model = settings.ollamaModel || "gemma2:2b";
  const t = withTimeout(30000);
  try {
    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: t.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: { temperature: 0 },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: buildUserPrompt(fields, ctx) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const j = await res.json();
    return parseAnswers(j?.message?.content || "", fields);
  } finally {
    t.done();
  }
}

// ---- Backend: Chrome built-in (Gemini Nano) --------------------------------

async function chromeAnswer(fields, ctx) {
  const LM = globalThis.LanguageModel;
  if (!LM) throw new Error("chrome built-in AI unavailable");
  const avail = await LM.availability?.();
  if (avail === "unavailable") throw new Error("chrome built-in AI unavailable");
  const session = await LM.create({ initialPrompts: [{ role: "system", content: SYSTEM }] });
  try {
    const text = await session.prompt(buildUserPrompt(fields, ctx));
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
    try {
      const got = await BACKENDS[name](remaining, ctx, settings);
      let n = 0;
      for (const [k, v] of Object.entries(got)) {
        if (!(k in answersByKey)) { answersByKey[k] = v; n++; }
      }
      if (n) used.push(`${name}:${n}`);
      remaining = remaining.filter((f) => !(f.key in answersByKey));
    } catch (err) {
      used.push(`${name}:skip`); // backend unavailable — fall through to the next
    }
  }

  return { answersByKey, meta: { used, unresolved: remaining.map((f) => f.key) } };
}
