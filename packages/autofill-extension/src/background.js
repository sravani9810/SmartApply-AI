// Service worker. Only job now: seed default settings on install. The popup
// drives autofill directly via chrome.scripting (no message relay), so there's
// no messaging that can fail with "receiving end doesn't exist".

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.sync.get("settings");
  if (!settings) {
    // Auto-fill on open, enabled by default. (Profile defaults come from
    // loadProfile() merging DEFAULT_PROFILE, so no need to seed it here.)
    await chrome.storage.sync.set({ settings: { autofillOnOpen: true } });
  }
});
