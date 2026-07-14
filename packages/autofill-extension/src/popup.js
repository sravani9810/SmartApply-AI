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

async function refreshCurrentJob() {
  const url = await activeTabUrl();
  currentJob = matchJobForUrl(url, jobs) ?? currentJob;
  renderJob();
}

$("jobPicker").addEventListener("change", (e) => {
  currentJob = jobs.find((j) => j.id === e.target.value) ?? null;
  renderJob();
});

async function mark(status) {
  if (!currentJob) return;
  statuses[currentJob.id] = await setStatus(currentJob.id, status);
  renderJob();
  statusEl.textContent = `Marked "${currentJob.title}" as ${status}.`;
}
$("markApplied").addEventListener("click", () => mark("applied"));
$("markSkipped").addEventListener("click", () => mark("skipped"));

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

/* ---------- init ---------- */

(async () => {
  writeForm(await loadProfile());
  const s = await loadSettings();
  $("autofillOnOpen").checked = s.autofillOnOpen;
  $("learnToggle").checked = s.learningEnabled;
  await showLearnedCount();
  jobs = await loadJobs();
  statuses = await getStatuses();
  await refreshCurrentJob();
})();
