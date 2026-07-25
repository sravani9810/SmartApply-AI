// Service worker (ES module). Seeds default settings and hosts the Auto-pilot
// loop: the popup sends "autopilot:start" and the loop drives the tab here in
// the background, so it survives the popup closing and full-page navigations.

import { runAutopilot } from "./agent.js";

const DEFAULT_SETTINGS = {
  autofillOnOpen: true,
  learningEnabled: true,
  reasonerBackend: "auto", // auto | ollama | chrome | claude
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "gemma2:2b",
};

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.sync.get("settings");
  await chrome.storage.sync.set({ settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) } });
});

// --- Auto-pilot job state ---------------------------------------------------

let job = null; // { tabId, stop } while running, else null

/** Persist the latest state so a reopened popup can render current progress. */
async function setState(patch) {
  const { autopilotState = {} } = await chrome.storage.local.get("autopilotState");
  const next = { ...autopilotState, ...patch, at: Date.now() };
  await chrome.storage.local.set({ autopilotState: next });
  // Best-effort live push to an open popup (ignored if none is listening).
  chrome.runtime.sendMessage({ type: "autopilot:progress", state: next }).catch(() => {});
}

async function startAutopilot(tabId) {
  if (job) return { ok: false, error: "Auto-pilot already running." };
  job = { tabId, stop: false };

  const [{ settings = {}, profile = {} }, { learned = {}, hubUrl }] = await Promise.all([
    chrome.storage.sync.get(["settings", "profile"]),
    chrome.storage.local.get(["learned", "hubUrl"]),
  ]);
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const base = { profile, learned, hubUrl: hubUrl || "http://localhost:3100" };

  await setState({ running: true, tabId, phase: "start", message: "Starting Auto-pilot…", result: null });

  // Run detached; report terminal result when it resolves.
  (async () => {
    let result;
    try {
      result = await runAutopilot(tabId, base, merged, {
        onProgress: (evt) => setState({ running: true, ...evt }),
        shouldStop: () => !job || job.stop,
      });
    } catch (err) {
      result = { status: "error", message: `Auto-pilot error: ${err.message}` };
    }
    job = null;
    await setState({ running: false, phase: "done", message: result.message, result });
  })();

  return { ok: true };
}

function stopAutopilot() {
  if (job) job.stop = true;
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "autopilot:start") {
    startAutopilot(msg.tabId).then(sendResponse);
    return true; // async response
  }
  if (msg?.type === "autopilot:stop") {
    sendResponse(stopAutopilot());
    return false;
  }
  if (msg?.type === "autopilot:state") {
    chrome.storage.local.get("autopilotState").then(({ autopilotState }) =>
      sendResponse({ state: autopilotState || null, running: !!job }),
    );
    return true;
  }
  return false;
});
