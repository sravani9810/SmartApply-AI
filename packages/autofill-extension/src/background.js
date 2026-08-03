// Service worker (ES module). Seeds default settings and hosts the Auto-pilot
// loop: the popup sends "autopilot:start" and the loop drives the tab here in
// the background, so it survives the popup closing and full-page navigations.

import { runAutopilot } from "./agent.js";
import { alog } from "./log.js";

const DEFAULT_SETTINGS = {
  autofillOnOpen: true,
  learningEnabled: true,
  reasonerBackend: "auto", // auto | ollama | chrome | claude
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "gemma3:1b",
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

/** Is the local Ollama server up, and is the configured model pulled? */
async function checkOllama(settings) {
  const url = (settings.ollamaUrl || "http://localhost:11434").replace(/\/+$/, "");
  const want = settings.ollamaModel || "gemma3:1b";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`${url}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { state: "off", reason: `Ollama HTTP ${res.status}` };
    const models = ((await res.json()).models || []).map((m) => m.name);
    const base = want.split(":")[0];
    const has = models.some((n) => n === want || n.split(":")[0] === base);
    return has
      ? { state: "on", reason: `${want} ready` }
      : { state: "warn", reason: `Ollama up, but ${want} not pulled (run: ollama pull ${want})` };
  } catch {
    clearTimeout(timer);
    return { state: "off", reason: `Ollama not reachable at ${url}` };
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
