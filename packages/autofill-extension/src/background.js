// Service worker (ES module). Seeds default settings and hosts the Auto-pilot
// loop: the popup sends "autopilot:start" and the loop drives the tab here in
// the background, so it survives the popup closing and full-page navigations.

import { runAutopilot } from "./agent.js";
import { alog } from "./log.js";

const DEFAULT_SETTINGS = {
  autofillOnOpen: true,
  learningEnabled: true,
  reasonerBackend: "auto", // auto | ollama | chrome | claude
  ollamaModel: "gemma3:1b",
};

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.sync.get("settings");
  await chrome.storage.sync.set({ settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) } });
});

// --- Auto-pilot job state ---------------------------------------------------

let job = null; // { tabId, stop } while running, else null

// MV3 shuts down an idle service worker after ~30s. The Auto-pilot loop runs
// detached and can sit far longer than that inside a single model call, which
// would kill the run mid-flight with no error and no final state — the popup
// just stays on its last message. Calling any extension API resets that idle
// timer, so ping one harmlessly while a job is in flight.
let keepAlive = null;

function startKeepAlive() {
  if (keepAlive) return;
  keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo().catch(() => {});
  }, 20000);
}

function stopKeepAlive() {
  if (keepAlive) clearInterval(keepAlive);
  keepAlive = null;
}

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

  const [{ settings = {}, profile = {} }, { learned = {}, hubUrl, resumeContext = {} }] = await Promise.all([
    chrome.storage.sync.get(["settings", "profile"]),
    chrome.storage.local.get(["learned", "hubUrl", "resumeContext"]),
  ]);
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const base = { profile, learned, resume: resumeContext, hubUrl: hubUrl || "http://localhost:3100" };

  await setState({ running: true, tabId, phase: "start", message: "Starting Auto-pilot…", result: null });
  alog("info", "autopilot", `▶ start (tab ${tabId})`, {
    engine: merged.reasonerBackend,
    profileFields: Object.values(profile).filter(Boolean).length,
    learned: Object.keys(learned).length,
    experiences: base.resume?.experiences?.length ?? 0,
    education: base.resume?.education?.length ?? 0,
  });

  // Run detached; report terminal result when it resolves.
  startKeepAlive();
  (async () => {
    let result;
    try {
      result = await runAutopilot(tabId, base, merged, {
        onProgress: (evt) => {
          setState({ running: true, ...evt });
          alog("info", "autopilot", evt.message, { phase: evt.phase, step: evt.step });
        },
        shouldStop: () => !job || job.stop,
      });
    } catch (err) {
      result = { status: "error", message: `Auto-pilot error: ${err.message}` };
      alog("error", "autopilot", "crashed", { error: err.message });
    }
    job = null;
    stopKeepAlive();
    await setState({ running: false, phase: "done", message: result.message, result });
    const level = ["error", "stuck", "max-steps"].includes(result.status) ? "warn" : "info";
    alog(level, "autopilot", `■ done: ${result.status}`, { message: result.message, filled: result.filled });
  })();

  return { ok: true };
}

function stopAutopilot() {
  if (job) { job.stop = true; alog("warn", "autopilot", "⏹ stop requested by user"); }
  return { ok: true };
}

// --- Model connectivity probes (run here so they match where the reasoner runs) -

/**
 * Is the local model reachable and pulled? Asked via the hub, because Ollama
 * answers chrome-extension:// origins with a 403 — the same reason the reasoner
 * proxies its completions. If the hub is down we can't know, so report "off".
 */
async function checkOllama(settings) {
  const { hubUrl } = await chrome.storage.local.get("hubUrl");
  const base = (hubUrl || "http://localhost:3100").replace(/\/+$/, "");
  const want = settings.ollamaModel || "gemma3:1b";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${base}/api/local-model?model=${encodeURIComponent(want)}`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { state: "off", reason: `hub HTTP ${res.status}` };
    return await res.json();
  } catch {
    clearTimeout(timer);
    return { state: "off", reason: "hub unreachable — local model status unknown" };
  }
}

/** Is Chrome's built-in LanguageModel (Gemini Nano) usable in this browser? */
async function checkChromeAI() {
  try {
    const LM = globalThis.LanguageModel;
    if (!LM?.availability) return { state: "off", reason: "Not supported in this Chrome" };
    const a = await LM.availability();
    if (a === "available") return { state: "on", reason: "Gemini Nano ready" };
    if (["downloadable", "downloading", "after-download"].includes(a))
      return { state: "warn", reason: `Gemini Nano ${a} (first use downloads it)` };
    return { state: "off", reason: `Gemini Nano ${a}` };
  } catch (err) {
    return { state: "off", reason: `unavailable: ${err.message}` };
  }
}

async function modelStatus() {
  const { settings = {} } = await chrome.storage.sync.get("settings");
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const [ollama, chromeAI] = await Promise.all([checkOllama(merged), checkChromeAI()]);
  return { ollama, chrome: chromeAI };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "models:status") {
    modelStatus().then(sendResponse);
    return true; // async response
  }
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
