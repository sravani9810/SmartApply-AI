// Extension settings. The applicant's personal data no longer lives here — it
// is stored in the SmartApply Hub and synced down (see syncProfileFromHub in
// jobs.js). This file only holds local extension toggles.

export const DEFAULT_SETTINGS = {
  /** Auto-fill the form when an application page opens (never auto-submits). */
  autofillOnOpen: true,
  /** Learn answers from what you type on application forms, for next time. */
  learningEnabled: true,
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
