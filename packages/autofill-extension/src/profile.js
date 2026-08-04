// Extension settings. The applicant's personal data no longer lives here — it
// is stored in the SmartApply Hub and synced down (see syncProfileFromHub in
// jobs.js). This file only holds local extension toggles.

export const DEFAULT_SETTINGS = {
  /** Auto-fill the form when an application page opens (never auto-submits). */
  autofillOnOpen: true,
  /** Learn answers from what you type on application forms, for next time. */
  learningEnabled: true,
  /**
   * Reasoning engine for the Auto-pilot's unknown fields:
   *   "auto"   — fast local model first (Chrome built-in → Ollama), then Claude
   *   "ollama" — local Ollama (Gemma) only
   *   "chrome" — Chrome built-in (Gemini Nano) only
   *   "claude" — Claude via the Hub only (highest quality, needs the Hub online)
   */
  reasonerBackend: "auto",
  /**
   * Local Ollama endpoint + model for the "ollama"/"auto" engines.
   * gemma3:1b is the default because this backend sits on the hot path: it
   * answers a form step in ~1-2s once resident (~20s on the first, cold call),
   * where a large reasoning model like gemma4 takes ~45s+ per step. The
   * trade-off is accuracy — small models do misread fields, and on the "auto"
   * engine whatever this answers never escalates to Claude. Set any pulled
   * model here; the reasoner sends `think: false` so reasoning models answer
   * directly instead of thinking first.
   */
  ollamaModel: "gemma3:1b",
};

export async function loadSettings() {
  const { settings } = await chrome.storage.sync.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set({ settings });
}

/** The profile fields synced from the hub (storage.sync.profile). */
export async function loadProfile() {
  const { profile } = await chrome.storage.sync.get("profile");
  return profile ?? {};
}

// --- Curated answer bank (AnswerEntry[], see @smartapply/shared) ---
// Kept in chrome.storage.local (like learned answers): machine-local, never
// synced or sent anywhere. content.js reads the same key to fill forms.
const ANSWERS_KEY = "answers";

/** @typedef {import("@smartapply/shared").AnswerEntry} AnswerEntry */

export async function loadAnswers() {
  const { [ANSWERS_KEY]: answers } = await chrome.storage.local.get(ANSWERS_KEY);
  return Array.isArray(answers) ? answers : [];
}

export async function saveAnswers(answers) {
  await chrome.storage.local.set({ [ANSWERS_KEY]: answers });
}

/** Serialize profile + answers to the answers.json (AnswerBank) shape. */
export function toAnswerBank(profile, answers) {
  return { version: 1, updatedAt: new Date().toISOString(), profile, answers };
}

/**
 * Parse an imported answers.json into { profile, answers }. Tolerates a bare
 * AnswerEntry[] (no wrapping object) too.
 */
export function fromAnswerBank(fileText) {
  const parsed = JSON.parse(fileText);
  const answers = Array.isArray(parsed) ? parsed : parsed.answers;
  if (!Array.isArray(answers)) {
    throw new Error("Not an answer bank (expected { answers: [...] }).");
  }
  const profile = (!Array.isArray(parsed) && parsed.profile) || {};
  return { profile, answers };
}
