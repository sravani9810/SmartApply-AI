// Auto-pilot orchestration loop. Runs in the background service worker and
// drives the active tab through a (possibly multi-page) application:
//
//   observe → deterministic fill → reason unknowns → apply → decide
//     · required field still empty  → stop, hand back to the human
//     · a "Next / Continue" button  → click it, wait for the page to settle, repeat
//     · a final "Submit" and no Next → stop AT submit (we never submit)
//
// Page interaction goes through the primitives content.js exposes on `window`
// (__smartApplyObserve / __smartApplyFill / __smartApplyApply / __smartApplyNext),
// called per-frame via chrome.scripting so embedded ATS iframes work too.

import { reason } from "./reasoner.js";

const MAX_STEPS = 15;
const SETTLE_TIMEOUT = 12000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Inject the filler into every frame (idempotent) so the primitives exist. */
async function ensureInjected(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"],
    });
  } catch { /* some frames (chrome://, PDF) can't be injected — ignore */ }
}

/** Run a window.* primitive in one frame and return its result. */
async function inFrame(tabId, frameId, fnName, arg) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      args: [fnName, arg ?? null],
      func: (name, a) => (window[name] ? window[name](a) : null),
    });
    return r?.result ?? null;
  } catch {
    return null;
  }
}

/** Observe every frame; return [{ frameId, snap }] for frames that responded. */
async function observeAll(tabId) {
  let results = [];
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => (window.__smartApplyObserve ? window.__smartApplyObserve() : null),
    });
  } catch {
    return [];
  }
  return results
    .filter((r) => r?.result)
    .map((r) => ({ frameId: r.frameId, snap: r.result }));
}

/** Score a frame so we drive the one that actually holds the application form. */
function frameScore({ snap }) {
  return snap.fields.length + (snap.isForm ? 5 : 0) + (snap.hasNext || snap.hasSubmit ? 2 : 0);
}

/** Pick the frame most likely to be the active application form. */
function pickTarget(frames) {
  const withForm = frames.filter((f) => f.snap.fields.length || f.snap.hasNext || f.snap.hasSubmit);
  if (withForm.length === 0) return null;
  return withForm.sort((a, b) => frameScore(b) - frameScore(a))[0];
}

/** A stable signature of the current page, for loop / settle detection. */
function signature(frames) {
  const target = pickTarget(frames);
  if (!target) return "empty";
  const { snap } = target;
  return `${snap.url}::${snap.fields.map((f) => f.label).sort().join("|")}`;
}

/** Wait until the page changes (SPA step or full reload) or a timeout elapses. */
async function waitForSettle(tabId, prevSig) {
  const deadline = Date.now() + SETTLE_TIMEOUT;
  await sleep(700); // let click handlers / navigation kick off
  while (Date.now() < deadline) {
    await ensureInjected(tabId);
    const frames = await observeAll(tabId);
    if (frames.length && signature(frames) !== prevSig) {
      await sleep(500); // small extra beat for late-rendering fields
      return;
    }
    await sleep(500);
  }
}

/**
 * Drive the tab. `hooks.onProgress(evt)` reports each phase; `hooks.shouldStop()`
 * lets the caller cancel between steps. Resolves with a terminal result object.
 */
export async function runAutopilot(tabId, base, settings, hooks = {}) {
  const onProgress = hooks.onProgress || (() => {});
  const shouldStop = hooks.shouldStop || (() => false);
  const seen = new Set();
  let totalFilled = 0;

  for (let step = 1; step <= MAX_STEPS; step++) {
    if (shouldStop()) return { status: "stopped", message: "Auto-pilot stopped." };

    onProgress({ step, phase: "observe", message: `Step ${step}: reading the page…` });
    await ensureInjected(tabId);
    let frames = await observeAll(tabId);
    let target = pickTarget(frames);

    if (!target) {
      return { status: "no-form", message: "No application form found on this page." };
    }
    const { frameId } = target;
    const url = target.snap.url;
    const ctx = { ...base, url };

    // 1. Deterministic pass — instant, from the synced profile + learned answers.
    onProgress({ step, phase: "fill", message: `Step ${step}: filling known fields…` });
    const detResult = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      args: [base.profile, base.learned, false],
      func: (p, l, s) => (window.__smartApplyFill ? window.__smartApplyFill(p, l, s) : { filled: 0 }),
    }).then((r) => r?.[0]?.result).catch(() => null);
    totalFilled += detResult?.filled || 0;

    // 2. Re-observe, then reason about whatever is still empty.
    frames = await observeAll(tabId);
    target = frames.find((f) => f.frameId === frameId) || pickTarget(frames);
    const empties = (target?.snap.fields || []).filter((f) => !f.filled && !f.consent);

    let reasoned = 0;
    if (empties.length) {
      onProgress({
        step, phase: "reason",
        message: `Step ${step}: reasoning about ${empties.length} field(s)…`,
      });
      const { answersByKey, meta } = await reason(empties, ctx, settings);
      if (Object.keys(answersByKey).length) {
        reasoned = await inFrame(tabId, frameId, "__smartApplyApply", answersByKey) || 0;
        totalFilled += reasoned;
      }
      onProgress({
        step, phase: "reason",
        message: `Step ${step}: filled ${reasoned} (via ${meta.used.join(", ") || "none"}).`,
      });
    }

    // 3. Re-observe and decide what to do next.
    frames = await observeAll(tabId);
    target = frames.find((f) => f.frameId === frameId) || pickTarget(frames);
    const snap = target?.snap;
    if (!snap) return { status: "done", message: "Page finished.", filled: totalFilled };

    const requiredEmpty = snap.fields.filter((f) => f.required && !f.filled && !f.consent);

    if (requiredEmpty.length) {
      return {
        status: "needs-input",
        message: `${requiredEmpty.length} required field(s) need you: ${requiredEmpty.map((f) => f.label).slice(0, 5).join(", ")}.`,
        filled: totalFilled,
      };
    }

    if (snap.hasSubmit && !snap.hasNext) {
      return {
        status: "ready-to-submit",
        message: `Everything filled across the form. Review, then click Submit yourself.`,
        filled: totalFilled,
      };
    }

    if (snap.hasNext) {
      const sig = signature(frames);
      if (seen.has(sig)) {
        return { status: "stuck", message: "The form isn't advancing — please continue manually.", filled: totalFilled };
      }
      seen.add(sig);
      onProgress({ step, phase: "navigate", message: `Step ${step}: continuing to the next page…` });
      const clicked = await inFrame(tabId, frameId, "__smartApplyNext", null);
      if (!clicked) {
        return { status: "stuck", message: "Couldn't find the Next button — please continue manually.", filled: totalFilled };
      }
      await waitForSettle(tabId, sig);
      continue;
    }

    // No Next and no Submit: likely a confirmation / non-form page.
    return { status: "done", message: "Nothing left to fill here.", filled: totalFilled };
  }

  return { status: "max-steps", message: "Reached the step limit — please finish manually.", filled: totalFilled };
}
