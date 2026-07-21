import {
  PROFILE_FIELDS,
  loadProfile,
  saveProfile,
  loadSettings,
  saveSettings,
} from "./profile.js";
import {
  loadJobs,
  importJobs,
  getStatuses,
  setStatus,
  matchJobForUrl,
  buildStatusUpdates,
  syncFromHub,
  postStatusToHub,
  getApplicationContext,
  getHubUrl,
  setHubUrl,
} from "./jobs.js";

const $ = (id) => document.getElementById(id);
const statusEl = $("status");

/* ---------- profile (autofill) ---------- */

// Build the profile inputs from the field spec (keeps HTML and JS in sync).
const container = $("profileFields");
for (const f of PROFILE_FIELDS) {
  const label = document.createElement("label");
  label.textContent = f.label;
  const input =
    f.type === "textarea"
      ? document.createElement("textarea")
      : document.createElement("input");
  if (f.type && f.type !== "textarea") input.type = f.type;
  input.id = f.key;
  container.append(label, input);
}

const readForm = () =>
  Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, $(f.key).value.trim()]));
const writeForm = (p) =>
  PROFILE_FIELDS.forEach((f) => ($(f.key).value = p[f.key] ?? ""));

async function autofill(submit) {
  await saveProfile(readForm());
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    statusEl.textContent = "No active tab.";
    return;
  }
  const profile = readForm();
  const { learned = {} } = await chrome.storage.local.get("learned");
  try {
    // Inject the filler into every frame (idempotent), then call it. Using
    // scripting.executeScript avoids "receiving end doesn't exist" errors from
    // messaging a tab whose content script isn't loaded.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["content.js"],
    });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      args: [profile, learned, submit],
      func: (p, l, s) => (window.__smartApplyFill ? window.__smartApplyFill(p, l, s) : { filled: 0 }),
    });
    const filled = results.reduce((n, r) => n + (r.result?.filled || 0), 0);
    const submitted = results.some((r) => r.result?.submitted);
    statusEl.textContent = `Filled ${filled} field(s)${submitted ? ", submitted" : ""}.`;
  } catch {
    statusEl.textContent = "Can't run on this page (a chrome:// page, PDF, or the web store).";
  }
}

$("save").addEventListener("click", async () => {
  await saveProfile(readForm());
  statusEl.textContent = "Saved.";
});
$("fill").addEventListener("click", () => autofill(false));
$("fillSubmit").addEventListener("click", () => autofill(true));

// Settings toggles (preserve the other setting when saving one).
async function updateSetting(patch) {
  await saveSettings({ ...(await loadSettings()), ...patch });
}
$("autofillOnOpen").addEventListener("change", (e) =>
  updateSetting({ autofillOnOpen: e.target.checked }),
);
$("learnToggle").addEventListener("change", (e) =>
  updateSetting({ learningEnabled: e.target.checked }),
);

async function showLearnedCount() {
  const { learned = {} } = await chrome.storage.local.get("learned");
  const n = Object.keys(learned).length;
  $("learnedInfo").textContent = n
    ? `${n} learned answer${n === 1 ? "" : "s"} (used to fill unknown fields).`
    : "No learned answers yet — fill a form and it'll remember.";
}

$("clearLearned").addEventListener("click", async () => {
  await chrome.storage.local.set({ learned: {} });
  await showLearnedCount();
  statusEl.textContent = "Cleared learned answers.";
});

/* ---------- job context ---------- */

let jobs = [];
let statuses = {};
let currentJob = null; // resolved from URL match or manual pick

async function activeTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ?? "";
}

function effectiveStatus(job) {
  return statuses[job.id]?.status ?? job.status ?? "new";
}

function renderJob() {
  const title = $("jobTitle");
  const meta = $("jobMeta");
  const statusLine = $("jobStatus");
  const picker = $("jobPicker");
  const canMark = Boolean(currentJob);
  $("markApplied").disabled = !canMark;
  $("markSkipped").disabled = !canMark;

  if (jobs.length === 0) {
    title.textContent = "No jobs loaded.";
    title.className = "muted";
    meta.textContent = "Load your jobs-export.json below.";
    statusLine.textContent = "";
    picker.hidden = true;
    return;
  }

  if (currentJob) {
    const s = effectiveStatus(currentJob);
    title.textContent = currentJob.title;
    title.className = "";
    meta.textContent = `${currentJob.company}${currentJob.location ? " · " + currentJob.location : ""}`;
    statusLine.innerHTML = `<span class="badge ${s}">${s}</span>`;
  } else {
    title.textContent = "Couldn't match this page to a job.";
    title.className = "muted";
    meta.textContent = "Pick the job you're applying to:";
    statusLine.textContent = "";
  }

  // Manual picker always available as a fallback / override.
  picker.hidden = false;
  picker.innerHTML =
    `<option value="">— pick a job —</option>` +
    jobs
      .map(
        (j) =>
          `<option value="${j.id}" ${currentJob && j.id === currentJob.id ? "selected" : ""}>` +
          `${j.title} — ${j.company}</option>`,
      )
      .join("");
}

/** Show the hub's tailoring context (flavor, fit, PDF to attach) for a job. */
async function showTailored(job) {
  const el = $("jobTailored");
  el.innerHTML = "";
  if (!job) return;
  const ctx = await getApplicationContext(job.id);
  if (!ctx || !ctx.tailored) {
    el.innerHTML = `<span class="muted">No tailored résumé yet — tailor it in the Hub.</span>`;
    return;
  }
  const fit = ctx.fitScore != null ? `${Math.round(ctx.fitScore * 100)}% fit` : "";
  const by = ctx.usedClaude ? "Claude" : "tag-based";
  const base = await getHubUrl();
  el.innerHTML =
    `<div><b>Tailored:</b> ${ctx.flavor ?? "résumé"} · ${fit} · ${by}</div>` +
    `<a href="${base}${ctx.pdfUrl}" target="_blank" rel="noreferrer">⬇ Download tailored PDF to attach</a>`;
}

async function refreshCurrentJob() {
  const url = await activeTabUrl();
  currentJob = matchJobForUrl(url, jobs) ?? currentJob;
  renderJob();
  await showTailored(currentJob);
}

$("jobPicker").addEventListener("change", async (e) => {
  currentJob = jobs.find((j) => j.id === e.target.value) ?? null;
  renderJob();
  await showTailored(currentJob);
});

async function mark(status) {
  if (!currentJob) return;
  statuses[currentJob.id] = await setStatus(currentJob.id, status);
  renderJob();
  const synced = await postStatusToHub(currentJob.id, status); // write-back to the hub
  statusEl.textContent = `Marked "${currentJob.title}" as ${status}${synced ? " (synced to Hub)" : ""}.`;
}
$("markApplied").addEventListener("click", () => mark("applied"));
$("markSkipped").addEventListener("click", () => mark("skipped"));

$("syncHub").addEventListener("click", async () => {
  statusEl.textContent = "Syncing from Hub…";
  try {
    const count = await syncFromHub();
    jobs = await loadJobs();
    await refreshCurrentJob();
    statusEl.textContent = `Synced ${count} job(s) from Hub.`;
  } catch (err) {
    statusEl.textContent = `Sync failed: ${err.message}`;
  }
});

$("hubUrl").addEventListener("change", async (e) => {
  await setHubUrl(e.target.value.trim());
  statusEl.textContent = "Hub URL saved.";
});

$("importJobs").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const count = await importJobs(await file.text());
    jobs = await loadJobs();
    await refreshCurrentJob();
    statusEl.textContent = `Loaded ${count} job(s).`;
  } catch (err) {
    statusEl.textContent = `Import failed: ${err.message}`;
  }
});

$("exportStatus").addEventListener("click", async () => {
  const payload = buildStatusUpdates(await getStatuses());
  if (payload.updates.length === 0) {
    statusEl.textContent = "No status changes to export yet.";
    return;
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "status-updates.json";
  a.click();
  URL.revokeObjectURL(a.href);
  statusEl.textContent = `Exported ${payload.updates.length} status update(s).`;
});

/* ---------- add job & Claude fill (injected page functions) ---------- */

// These run in the page via chrome.scripting.executeScript, so they must be
// self-contained (no references to popup scope).

function scrapeJobFromPage() {
  const q = (sel) => document.querySelector(sel);
  const t = (el) => ((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim();
  const title =
    t(q('[data-testid="jobsearch-JobInfoHeader-title"]')) || t(q("h1")) || document.title;
  const company =
    t(q('[data-testid="company-name"]')) || t(q('[data-company-name]')) ||
    q('meta[property="og:site_name"]')?.content || "";
  const descEl = q("#jobDescriptionText") || q('[class*="jobDescription"]') || q("article") || q("main");
  const description = (
    (descEl && (descEl.innerText || descEl.textContent)) ||
    q('meta[name="description"]')?.content || ""
  ).trim();
  return { url: location.href, title, company, description: description.slice(0, 20000) };
}

function collectEmptyFields() {
  const out = [];
  let k = 0;
  const skip = ["hidden", "password", "file", "submit", "button", "checkbox", "radio", "email", "tel", "url"];
  const visible = (el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed";
  const labelOf = (el) => {
    let l = el.getAttribute("aria-label") || "";
    if (!l && el.id) l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent || "";
    if (!l) l = el.closest("label")?.textContent || "";
    if (!l) l = el.placeholder || el.name || "";
    return l.replace(/\s+/g, " ").trim();
  };
  document.querySelectorAll("input, textarea, select").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (el.disabled || el.readOnly) return;
    if (tag !== "select" && skip.includes((el.type || "").toLowerCase())) return;
    if (!visible(el)) return;
    if ((el.value || "").trim() !== "") return; // only empty fields
    const label = labelOf(el);
    if (!label) return;
    const key = "sa" + k++;
    el.setAttribute("data-sa-key", key);
    out.push({
      key, label,
      type: tag === "textarea" ? "textarea" : tag === "select" ? "select" : "text",
      options: tag === "select" ? [...el.options].map((o) => o.text.trim()).filter(Boolean) : undefined,
    });
  });
  return out;
}

function fillAnswers(byKey) {
  let filled = 0;
  const setVal = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  for (const [key, value] of Object.entries(byKey)) {
    if (!value) continue;
    const el = document.querySelector(`[data-sa-key="${key}"]`);
    if (!el) continue;
    if (el.tagName.toLowerCase() === "select") {
      const opt = [...el.options].find((o) => o.text.trim().toLowerCase() === String(value).toLowerCase());
      if (opt) { el.value = opt.value; el.dispatchEvent(new Event("change", { bubbles: true })); filled++; }
    } else if ((el.value || "").trim() === "") {
      setVal(el, value);
      filled++;
    }
  }
  return filled;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

$("addJob").addEventListener("click", async () => {
  statusEl.textContent = "Reading job page…";
  try {
    const tab = await activeTab();
    if (!tab?.id) throw new Error("No active tab.");
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapeJobFromPage });
    const data = r?.result;
    if (!data?.title) throw new Error("Couldn't read a job from this page.");
    const base = await getHubUrl();
    statusEl.textContent = "Adding & tailoring…";
    const res = await fetch(`${base}/api/jobs/add`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || `Hub returned ${res.status}`);
    try { await syncFromHub(); jobs = await loadJobs(); } catch { /* keep old */ }
    await refreshCurrentJob();
    const fit = j.fitScore != null ? `${Math.round(j.fitScore * 100)}% fit` : "";
    statusEl.innerHTML =
      `Added & tailored (${j.flavor ?? "résumé"} · ${fit} · ${j.usedClaude ? "Claude" : "tag-based"}). ` +
      `<a href="${base}${j.pdfUrl}" target="_blank" rel="noreferrer">PDF</a> · ` +
      `<a href="${base}${j.jobUrl}" target="_blank" rel="noreferrer">Hub</a>`;
  } catch (err) {
    statusEl.textContent = `Add failed: ${err.message}`;
  }
});

$("fillClaude").addEventListener("click", async () => {
  statusEl.textContent = "Collecting empty fields…";
  try {
    const tab = await activeTab();
    if (!tab?.id) throw new Error("No active tab.");
    const [c] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectEmptyFields });
    const fields = c?.result || [];
    if (fields.length === 0) { statusEl.textContent = "No empty fields left to fill."; return; }
    const base = await getHubUrl();
    statusEl.textContent = `Asking Claude about ${fields.length} field(s)…`;
    const res = await fetch(`${base}/api/answer`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: tab.url, fields }),
    });
    const answers = (await res.json()).answers || {};
    const byKey = {};
    for (const f of fields) if (answers[f.label]) byKey[f.key] = answers[f.label];
    if (Object.keys(byKey).length === 0) { statusEl.textContent = "Claude had no confident answers."; return; }
    const [f] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillAnswers, args: [byKey] });
    statusEl.textContent = `Claude filled ${f?.result ?? 0} field(s). Review before submitting.`;
  } catch (err) {
    statusEl.textContent = `Claude fill failed: ${err.message}`;
  }
});

/* ---------- init ---------- */

(async () => {
  writeForm(await loadProfile());
  const s = await loadSettings();
  $("autofillOnOpen").checked = s.autofillOnOpen;
  $("learnToggle").checked = s.learningEnabled;
  await showLearnedCount();
  $("hubUrl").value = await getHubUrl();
  jobs = await loadJobs();
  statuses = await getStatuses();
  await refreshCurrentJob();
})();
