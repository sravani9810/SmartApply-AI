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
  /** Local Ollama endpoint + model for the "ollama"/"auto" engines. */
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "gemma2:2b",
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
