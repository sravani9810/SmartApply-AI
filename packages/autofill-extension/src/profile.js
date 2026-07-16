// Applicant profile + settings, and helpers to load/save from chrome.storage.
// Kept dependency-free so it can be imported by the popup. (content.js keeps its
// own copy of the field matchers since MV3 content scripts can't import.)

/** The profile fields shown in the popup and filled into forms, in order. */
export const PROFILE_FIELDS = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "address", label: "Street address" },
  { key: "city", label: "City" },
  { key: "state", label: "State / Province" },
  { key: "zipcode", label: "ZIP / Postal code" },
  { key: "country", label: "Country" },
  { key: "linkedin", label: "LinkedIn URL" },
  { key: "website", label: "Website / Portfolio" },
  { key: "currentCompany", label: "Current company" },
  { key: "currentTitle", label: "Current title" },
  { key: "yearsExperience", label: "Years of experience" },
  { key: "coverLetter", label: "Cover letter", type: "textarea" },
  // Choice questions (radio/checkbox). Type the answer as it appears on forms.
  { key: "workAuthorized", label: "Authorized to work? (Yes/No)" },
  { key: "requiresSponsorship", label: "Need visa sponsorship? (Yes/No)" },
  { key: "gender", label: "Gender (optional, EEO)" },
  { key: "veteranStatus", label: "Veteran status (optional, EEO)" },
  { key: "disabilityStatus", label: "Disability status (optional, EEO)" },
];

/** @typedef {{ [field: string]: string }} Profile */
export const DEFAULT_PROFILE = Object.fromEntries(
  PROFILE_FIELDS.map((f) => [f.key, ""]),
);

export const DEFAULT_SETTINGS = {
  /** Auto-fill the form when an application page opens (never auto-submits). */
  autofillOnOpen: true,
  /** Learn answers from what you type on application forms, for next time. */
  learningEnabled: true,
};

export async function loadProfile() {
  const { profile } = await chrome.storage.sync.get("profile");
  return { ...DEFAULT_PROFILE, ...(profile ?? {}) };
}

export async function saveProfile(profile) {
  await chrome.storage.sync.set({ profile });
}

export async function loadSettings() {
  const { settings } = await chrome.storage.sync.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set({ settings });
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
