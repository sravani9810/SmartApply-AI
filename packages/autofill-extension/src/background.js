// Service worker. Thin coordinator: on install it seeds an empty profile so the
// popup has something to render, and it relays autofill requests to the active
// tab's content script.

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.sync.get("settings");
  if (!settings) {
    // Auto-fill on open, enabled by default. (Profile defaults are applied by
    // loadProfile() merging DEFAULT_PROFILE, so no need to seed it here.)
    await chrome.storage.sync.set({ settings: { autofillOnOpen: true } });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "AUTOFILL_ACTIVE_TAB") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          sendResponse({ error: "No active tab." });
          return;
        }
        const { profile } = await chrome.storage.sync.get("profile");
        const res = await chrome.tabs.sendMessage(tab.id, {
          type: "AUTOFILL",
          profile,
          submit: msg.submit,
        });
        sendResponse(res ?? { filled: 0 });
      } catch (err) {
        // e.g. "Could not establish connection" when the page has no content
        // script (chrome:// pages, the New Tab page, PDFs, the web store).
        sendResponse({ error: err?.message ?? String(err) });
      }
    })();
    return true; // keep the message channel open for the async response
  }
});
