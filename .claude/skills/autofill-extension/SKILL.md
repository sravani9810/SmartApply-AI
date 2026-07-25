---
name: autofill-extension
description: >-
  Work on the Part 2 Chrome (Manifest V3) autofill extension in
  packages/autofill-extension — add a new profile field or application question
  it fills, add site-specific handling for a tricky ATS (Workday, Greenhouse,
  Lever, iCIMS…), debug why a field isn't being filled, or change the
  fill/submit/learning behavior. Use this whenever the user mentions the
  autofill extension, form-filling, "the extension isn't filling X", adding a
  field to the profile, a specific job-application site's form, or the
  jobs-export/status-updates handoff — even if they don't say "Manifest V3".
---

# Autofill extension (Part 2)

A Manifest V3 Chrome extension that fills job-application forms from a saved
profile and tracks which job the current tab belongs to. **No build step** — the
`src/` folder *is* the extension. Read
[`packages/autofill-extension/README.md`](../../../packages/autofill-extension/README.md)
for the full behavior; this skill covers how to change it safely.

## Architecture (and the one rule that trips everyone up)

| File | Role | Context |
|------|------|---------|
| [`profile.js`](../../../packages/autofill-extension/src/profile.js) | `PROFILE_FIELDS`, `DEFAULT_PROFILE`, settings, storage helpers | ES module, imported by the popup |
| [`content.js`](../../../packages/autofill-extension/src/content.js) | the actual filler: matchers, form detection, set-value, choices, learning; plus Auto-pilot page primitives (`__smartApplyObserve`/`__smartApplyApply`/`__smartApplyNext`) | injected content script |
| [`agent.js`](../../../packages/autofill-extension/src/agent.js) | Auto-pilot loop: observe → fill → reason → navigate → **stop at submit** | ES module, imported by `background.js` |
| [`reasoner.js`](../../../packages/autofill-extension/src/reasoner.js) | pluggable reasoning backends (Ollama/Gemma, Chrome built-in Gemini Nano, Claude-via-Hub) + local-first→Claude router | ES module, imported by `agent.js` |
| [`popup.html`](../../../packages/autofill-extension/src/popup.html) / [`popup.js`](../../../packages/autofill-extension/src/popup.js) | profile editor, autofill toggle, Fill / Fill & Submit, **Auto-pilot** controls + engine settings, job panel | popup page |
| [`background.js`](../../../packages/autofill-extension/src/background.js) | ES-**module** worker: seeds settings, hosts the Auto-pilot loop (start/stop/progress) | service worker |
| [`jobs.js`](../../../packages/autofill-extension/src/jobs.js) | job store: import jobs, match current URL, track status | shared |

**The rule: `content.js` cannot `import`.** MV3 content scripts have no module
system, so `content.js` keeps its **own copy** of the field matchers
(`FIELD_MATCHERS` and `CHOICE_MATCHERS`) rather than importing from `profile.js`.
Any change to the set of fields must be made in **both files** or the popup and
the filler drift out of sync. This is the single most common mistake — treat
`profile.js` (what the user edits) and `content.js` (what fills the page) as two
halves that must agree.

## How filling works (so you debug the right layer)

For each fillable element, `content.js`:

1. Gathers **signals** via `fieldSignals(el)` — `name`, `id`, `aria-label`,
   `placeholder`, the `<label for>` / wrapping `<label>` text, and
   `aria-labelledby` targets — lowercased and joined.
2. Matches those signals against `FIELD_MATCHERS[field]` substrings
   (`fieldFor`), or `CHOICE_MATCHERS` for radio/checkbox groups.
3. Writes with `setValue`, which calls the **native prototype `value` setter**
   and dispatches `input` + `change` — this is deliberate so React/Vue
   controlled inputs actually register the change. A plain `el.value = x` would
   be silently reverted by the framework.

`deepFields()` walks **open shadow roots** too, so web-component forms are
covered. `fillable()` skips disabled/readonly/hidden/password/file inputs, and
filling only ever touches **empty** fields — it never overwrites what the user
typed. Auto-fill runs on page open (form detection watches the DOM for a few
seconds because ATS forms render late); it **never clicks submit**.

## Task: add a field or question the extension fills

1. Add it to `PROFILE_FIELDS` in `profile.js` (this drives the popup editor and
   `DEFAULT_PROFILE`). Give it a stable `key`, a `label`, and a `type` if it's an
   `email`/`tel`/`textarea`.
2. Add the matcher in `content.js`:
   - free-text field → an entry in `FIELD_MATCHERS` (key must equal the
     profile `key`), listing lowercase substrings seen in real forms' labels/
     names/ids/placeholders.
   - Yes/No or single-choice question → an entry in `CHOICE_MATCHERS` instead.
3. If the value is derived rather than stored (like `fullName` from
   `firstName`+`lastName`), handle it in `valueFor()`.
4. Reload and test (below). Add matcher substrings from the *actual* label text
   on the sites you care about — matching is substring-based and case-insensitive.

## Task: handle a specific ATS (Workday / Greenhouse / Lever / …)

When a board uses non-standard markup (custom widgets, unusual labels, delayed
rendering), branch on `location.hostname` inside `content.js` rather than
polluting the generic matchers. Keep the generic path intact as the fallback so
other sites are unaffected. Common culprits: options rendered as `div`s instead
of `<select>`/`<option>` (extend `fillSelect`/choice handling), inputs inside
shadow roots (already handled by `deepFields`), and forms that mount seconds
after load (the open-time watcher covers a few seconds — lengthen only if needed).

## Two hard limits — don't try to "fix" these

- **Resume/CV upload can't be automated.** Browsers forbid scripting a file
  input's value. The user always attaches the resume themselves. Don't add code
  that pretends to.
- **Submit stays manual.** Neither auto-fill nor Auto-pilot may click submit —
  submitting an application is irreversible. Auto-pilot *does* click
  **Next / Continue** to advance multi-page forms (`__smartApplyNext` is coded to
  only ever click next-like buttons, never submit-like ones — see the
  `CLICK_SUBMIT_RE` / `CLICK_NEXT_RE` split in `content.js`), but it stops at the
  final Submit. "Fill & Submit" remains a separate, explicit user action.

## Load / reload to test

There's no compile step. After editing any `src/` file:

1. `chrome://extensions` → **Developer mode** on.
2. First time: **Load unpacked** → `packages/autofill-extension/src`.
3. After edits: click the extension's **reload** ↻ (content-script changes also
   need the target application tab reloaded so the new `content.js` injects).
4. Open a real application form, click **Fill**, and confirm only empty fields
   changed. To debug matching, inspect the target page's console — the content
   script runs there, not in the popup.

## Pipeline handoff (Part 1 ↔ Part 2)

The extension imports the pipeline's `jobs-export.json` (see
[`examples/jobs-export.sample.json`](../../../packages/autofill-extension/examples/jobs-export.sample.json))
and exports `status-updates.json` back. Both shapes — `JobsExport`,
`StatusUpdatesFile` — are defined in `@smartapply/shared`
([`packages/shared/src/index.ts`](../../../packages/shared/src/index.ts)); if you
touch the import/export format, change it there so both sides agree.

## Checklist

- [ ] Field changes made in **both** `profile.js` and `content.js` (they can't share code)
- [ ] Matcher key equals the profile `key`; substrings taken from real form labels
- [ ] Values written via `setValue` (native setter + input/change), not `el.value =`
- [ ] Only empty fields touched; no auto-submit; no attempt to set file inputs
- [ ] Site-specific logic gated on `location.hostname`, generic path preserved
- [ ] Reloaded the extension **and** the application tab before testing
