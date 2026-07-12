// Shape of the applicant profile the extension fills forms with, plus helpers
// to load/save it from chrome.storage. Kept dependency-free so it can be
// imported by both the popup and the content script contexts.

/** @typedef {{ [field: string]: string }} Profile */

export const DEFAULT_PROFILE = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  linkedin: "",
  website: "",
};

/** Field name -> list of substrings matched (case-insensitive) against a
 * form field's name/id/label/placeholder to decide what to fill it with. */
export const FIELD_MATCHERS = {
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  email: ["email", "e-mail"],
  phone: ["phone", "mobile", "tel"],
  linkedin: ["linkedin"],
  website: ["website", "portfolio"],
};

export async function loadProfile() {
  const { profile } = await chrome.storage.sync.get("profile");
  return { ...DEFAULT_PROFILE, ...(profile ?? {}) };
}

export async function saveProfile(profile) {
  await chrome.storage.sync.set({ profile });
}
