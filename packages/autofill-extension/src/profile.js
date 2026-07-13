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
];

/** @typedef {{ [field: string]: string }} Profile */
export const DEFAULT_PROFILE = Object.fromEntries(
  PROFILE_FIELDS.map((f) => [f.key, ""]),
);

export const DEFAULT_SETTINGS = {
  /** Auto-fill the form when an application page opens (never auto-submits). */
  autofillOnOpen: true,
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
