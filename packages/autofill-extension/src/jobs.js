// Job context store for the extension.
//
// The pipeline (Part 1) writes a jobs-export.json; the user loads it here so the
// extension knows which posting the current tab corresponds to. Status changes
// are kept locally and exported as status-updates.json for the pipeline to read
// back into the workbook/sheet. See @smartapply/shared for the file shapes.

const JOBS_KEY = "jobs";
const STATUS_KEY = "statuses";
const HUB_KEY = "hubUrl";
const DEFAULT_HUB = "http://localhost:3100";

/** The SmartApply Hub base URL (Part 0), overridable in the popup. */
export async function getHubUrl() {
  const { [HUB_KEY]: url } = await chrome.storage.local.get(HUB_KEY);
  return (url || DEFAULT_HUB).replace(/\/+$/, "");
}
export async function setHubUrl(url) {
  await chrome.storage.local.set({ [HUB_KEY]: url });
}

/** Pull jobs live from the hub (replaces the manual jobs-export.json load). */
export async function syncFromHub() {
  const base = await getHubUrl();
  const res = await fetch(`${base}/api/jobs`);
  if (!res.ok) throw new Error(`Hub returned ${res.status} (is it running at ${base}?)`);
  const data = await res.json();
  const jobs = Array.isArray(data) ? data : data.jobs;
  if (!Array.isArray(jobs)) throw new Error("Unexpected /api/jobs response.");
  await chrome.storage.local.set({ [JOBS_KEY]: jobs });
  return jobs.length;
}

/** Write a status change back to the hub (best-effort). */
export async function postStatusToHub(id, status) {
  const base = await getHubUrl();
  try {
    await fetch(`${base}/api/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Fetch per-job tailoring context (flavor, fit, PDF url) from the hub. */
export async function getApplicationContext(jobId) {
  const base = await getHubUrl();
  try {
    const res = await fetch(`${base}/api/application/${encodeURIComponent(jobId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Load the imported jobs (JobExportEntry[]). */
export async function loadJobs() {
  const { [JOBS_KEY]: jobs } = await chrome.storage.local.get(JOBS_KEY);
  return Array.isArray(jobs) ? jobs : [];
}

/** Replace the stored jobs from a parsed jobs-export.json ({ jobs: [...] }). */
export async function importJobs(fileText) {
  const parsed = JSON.parse(fileText);
  const jobs = Array.isArray(parsed) ? parsed : parsed.jobs;
  if (!Array.isArray(jobs)) throw new Error("Not a jobs export (expected { jobs: [...] }).");
  await chrome.storage.local.set({ [JOBS_KEY]: jobs });
  return jobs.length;
}

/** Local status overrides: { [jobId]: { status, updatedAt } }. */
export async function getStatuses() {
  const { [STATUS_KEY]: statuses } = await chrome.storage.local.get(STATUS_KEY);
  return statuses && typeof statuses === "object" ? statuses : {};
}

export async function setStatus(id, status) {
  const statuses = await getStatuses();
  statuses[id] = { status, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [STATUS_KEY]: statuses });
  return statuses[id];
}

/** Pull the Indeed job key (jk) out of a URL, if present. */
function jkOf(url) {
  const m = /[?&]jk=([0-9a-z]+)/i.exec(url || "");
  return m ? m[1] : null;
}

/** Normalize a URL to origin+path (drop query/hash) for loose comparison. */
function basePath(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/**
 * Find the job that best matches the current tab URL:
 *   1. same Indeed jk
 *   2. one URL's base path contains the other's (apply page vs posting)
 * Returns the matching job or null.
 */
export function matchJobForUrl(url, jobs) {
  if (!url) return null;
  const jk = jkOf(url);
  if (jk) {
    const byJk = jobs.find((j) => jkOf(j.url) === jk);
    if (byJk) return byJk;
  }
  const base = basePath(url);
  if (base) {
    const byPath = jobs.find((j) => {
      const jb = basePath(j.url);
      return jb && (base.includes(jb) || jb.includes(base));
    });
    if (byPath) return byPath;
  }
  return null;
}

/** Build the status-updates.json payload ({ updates: [...] }). */
export function buildStatusUpdates(statuses) {
  return {
    updates: Object.entries(statuses).map(([id, s]) => ({
      id,
      status: s.status,
      updatedAt: s.updatedAt,
    })),
  };
}
