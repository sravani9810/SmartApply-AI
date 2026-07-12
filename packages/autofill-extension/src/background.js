// Service worker. Thin coordinator: on install it seeds an empty profile so the
// popup has something to render, and it relays autofill requests to the active
// tab's content script.

chrome.runtime.onInstalled.addListener(async () => {
  const { profile } = await chrome.storage.sync.get("profile");
  if (!profile) {
    await chrome.storage.sync.set({
      profile: { firstName: "", lastName: "", email: "", phone: "", linkedin: "", website: "" },
    });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "AUTOFILL_ACTIVE_TAB") {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const { profile } = await chrome.storage.sync.get("profile");
      const res = await chrome.tabs.sendMessage(tab.id, {
        type: "AUTOFILL",
        profile,
        submit: msg.submit,
      });
      sendResponse(res);
    })();
    return true; // keep the message channel open for the async response
  }
});
