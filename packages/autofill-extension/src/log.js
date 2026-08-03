// Extension-side logger. Every call prints to the extension's own console
// (the service-worker "Inspect" console) AND is shipped, best-effort and
// non-blocking, to the hub's POST /api/log so it shows up live in the
// `npm run hub` terminal — that's where you get visibility into the Auto-pilot.
//
// ES module: importable by background.js / agent.js / reasoner.js. (content.js
// can't import, so it stays console-only; the agent logs its results instead.)

let cachedHubUrl = null;

async function hubBase() {
  if (cachedHubUrl) return cachedHubUrl;
  const { hubUrl } = await chrome.storage.local.get("hubUrl");
  cachedHubUrl = (hubUrl || "http://localhost:3100").replace(/\/+$/, "");
  return cachedHubUrl;
}

// Keep the cached hub URL fresh if the user changes it in the popup.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.hubUrl) cachedHubUrl = null;
});

/**
 * Log an event. `level` is "info" | "warn" | "error"; `scope` groups related
 * lines (e.g. "autopilot", "reasoner"); `data` is an optional serializable blob.
 * Fire-and-forget — never awaited on the hot path.
 */
export function alog(level, scope, message, data) {
  const fn = console[level] || console.log;
  fn(`[${scope}] ${message}`, data ?? "");
  hubBase()
    .then((base) =>
      fetch(`${base}/api/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, scope, message, data }),
      }).catch(() => {}),
    )
    .catch(() => {}); // hub offline — the extension console still has it
}
