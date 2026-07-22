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
