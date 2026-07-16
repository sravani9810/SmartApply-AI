# SmartApply-AI — Commit Changelog

A commit-by-commit record of what was built across the project, grouped by part,
with **what changed** and **why it was needed**. Merge commits and the earlier
history-rewrite duplicates are omitted; only the logical commits on the default
branch are listed, oldest first within each section.

> Attribution note: all commits are authored by the repo owner. Earlier
> `Co-Authored-By` trailers were intentionally stripped from the history.

Legend: each entry is `` `shorthash` — date `` then the change and its rationale.

---

## Foundation

### `f2c41a4` — 2026-07-11 · Initial commit
- **What:** Empty monorepo scaffold.
- **Why:** Starting point for the three-part workspace (shared / job-search /
  autofill-extension / resume-matcher).

### `12c22e0` — 2026-07-12 · Parts 2 & 3 scaffold + shared model
- **What:** Added the Manifest V3 autofill extension (Part 2) and the
  Claude-based resume/JD matcher (Part 3), plus the shared
  `JobPosting`/`MatchResult` model they build on.
- **Why:** Established the packages and the common type foundation the rest of
  the work extends. (Part 3 later split onto its own branch.)

---

## Part 1 — Job Search, Excel & Scheduler

### `bce21b4` — 2026-07-12 · Job-search + Excel logging with Indeed capture
- **What:** The `job-search` package — board connectors, a recruiter-enrichment
  hook, the Excel writer, the hourly orchestrator, and the shared `JobPosting`
  model. Includes a real Indeed capture and an importer writing to
  `data/jobs.xlsx`.
- **Why:** The core of Part 1: discover postings and log one structured row per
  job.

### `282f66e` — 2026-07-12 · Stop tracking generated `data/jobs.xlsx`
- **What:** Removed the generated workbook from git; kept the diffable JSON
  capture as the source of truth and gitignored the `.xlsx`.
- **Why:** The workbook is regenerable and its `capturedAt` timestamp churns on
  every run, so it doesn't belong in version control.

### `4f18a41` — 2026-07-12 · Optional Google Sheets sync
- **What:** Extracted the column schema into `columns.ts` (shared by all sinks)
  and added a Google Sheets sink that upserts postings by `id` via a service
  account. Also fixed an ExcelJS bug (column keys aren't persisted, so they're
  reassigned by position on load).
- **Why:** Lets users mirror the workbook to a Sheet — but only when configured,
  so the pipeline stays local-only by default. The Excel fix stopped upserts into
  an existing file from throwing.

### `5d8f666` — 2026-07-12 · Auto-load `.env` via dotenv
- **What:** Import `dotenv/config` at the top of the orchestrator.
- **Why:** So Google/Sheets credentials can live in a gitignored `.env` instead
  of shell exports — required for unattended/hourly runs.

### `602cc14` — 2026-07-12 · Load repo-root `.env` regardless of cwd
- **What:** Resolve the root `.env` from the module location; apply the same fix
  to `import-indeed.mjs` and give it the optional Sheets sync.
- **Why:** Workspace scripts run with `cwd` = package dir, so dotenv's default
  lookup missed the root `.env` and the Sheets sync was silently skipped.

### `d4f98c7` — 2026-07-12 · Tolerate a full sheet URL in the ID env var
- **What:** Extract the spreadsheet ID from a pasted URL; clarify in
  `.env.example` that `GOOGLE_APPLICATION_CREDENTIALS` is the JSON key path, not
  the sheet URL.
- **Why:** Prevents a common configuration mix-up.

### `762c11f` — 2026-07-12 · Live Indeed connector via logged-in Chrome (Playwright)
- **What:** A persistent Chrome profile you log into once (`npm run
  login:indeed`), reused on every run so the pipeline fetches Indeed results *as
  you*. Enabled with `INDEED_ENABLED=true`; falls back to the synthetic example
  board otherwise.
- **Why:** Anonymous scraping trips Indeed's bot walls; driving a logged-in
  profile avoids them and enables unattended fetching.

### `51bca0d` — 2026-07-12 · Preserve workflow columns on re-fetch
- **What:** `mergePreserving()` keeps workflow-owned fields (Status, Fit Score,
  Captured At, filled recruiter contact) while refreshing board-owned fields, in
  both the Excel and Sheets sinks.
- **Why:** Hourly re-runs previously overwrote whole rows, resetting Status to
  "new" and bumping Captured At every run. Upsert-by-`id` now updates without
  clobbering your tracking.

### `6cd728b` — 2026-07-12 · Hourly launchd scheduler + headed Indeed fixes
- **What:** A `launchd` LaunchAgent that builds and runs the pipeline at the top
  of every hour with logging. Plus two connector fixes: lazy board selection
  (so `INDEED_ENABLED` is read after dotenv loads) and running Chrome headed
  (Cloudflare hard-blocks headless).
- **Why:** Enables scheduled unattended runs; the fixes were necessary for the
  Indeed connector to actually work under the scheduler.

### `b6cdb16` — 2026-07-12 · `schedule:{on,off,now,status}` helper scripts
- **What:** Wrapped `launchctl` in `scripts/schedule.sh` and npm scripts.
- **Why:** Toggle the scheduler without remembering `launchctl` syntax.

### `257fecf` — 2026-07-12 · Document scheduler commands in README
- **What:** Root README documents the on/off commands.
- **Why:** Discoverability of the scheduler controls.

### `84eec23` — 2026-07-12 · `.env`-driven search preferences
- **What:** Read `JOB_KEYWORDS` / `JOB_LOCATION` / `JOB_POSTED_WITHIN_DAYS` at
  run time via a lazy `getConfig()`.
- **Why:** Users change the search without editing TypeScript or rebuilding.

### `691dd1f` — 2026-07-12 · Last Seen At, multiple searches, setup docs
- **What:** A "Last Seen At" column refreshed each run (Captured At stays
  first-seen); `JOB_SEARCHES` to run several "keywords @ location" queries in one
  pass with run-level dedup by `id`; expanded setup docs.
- **Why:** Distinguish stale vs. still-live jobs, cover multiple searches in one
  workbook, and make setup clearer.

---

## Part 2 — Autofill Chrome Extension

### `a5b96fb` — 2026-07-12 · Job-context-aware extension
- **What:** Split the extension onto its own branch and connected it to the
  pipeline: load a `jobs-export.json`, match the current tab to a posting (Indeed
  `jk` or overlapping URL path), track per-job status, and export
  `status-updates.json`. Added the `JobsExport` / `StatusUpdatesFile` contract
  and the "This job" popup panel.
- **Why:** Ties the extension to Part 1 so it knows which posting you're applying
  to and can report status back into the workbook/sheet.

### `6cbff9f` — 2026-07-12 · Real application-form autofill + auto-fill on open
- **What:** Expanded the filler to cover real fields (name, email, phone, full
  address, LinkedIn/website, company/title, experience, cover letter) with
  label/aria matching. Fills only empty fields, derives full name, skips file
  inputs. Added auto-fill-on-open (watches the DOM for late-rendering ATS forms;
  never auto-submits).
- **Why:** Turns the extension from a stub into a usable autofiller for actual
  applications.

### `02d3863` — 2026-07-14 · All frames + Shadow DOM
- **What:** Run in all frames (`all_frames` + `match_about_blank`) and traverse
  open shadow roots when collecting fields.
- **Why:** The two most common failure modes on real ATS pages — forms inside
  iframes (Greenhouse/Lever) and Shadow DOM/web components (Workday).

### `a15ea82` — 2026-07-14 · Harden the autofill relay
- **What:** Wrapped the background handler in try/catch and always call
  `sendResponse`.
- **Why:** Pages with no content script (chrome://, New Tab, PDFs, web store)
  returned an unhandled "message port closed" error; now they surface a friendly
  message.

### `075a4f6` — 2026-07-14 · Drive autofill via `chrome.scripting`
- **What:** The popup now injects `content.js` on demand (idempotent, guarded
  IIFE exposing `window.__smartApplyFill`) and calls it across all frames via
  `executeScript`, replacing the message relay.
- **Why:** No messaging means no "receiving end doesn't exist" errors when a
  tab's content script isn't loaded (e.g. after reloading the extension).

### `7fbbd47` — 2026-07-14 · Native `<select>` dropdowns + more synonyms
- **What:** Fill native `<select>` fields by matching the profile value to an
  option (exact, then contains); broadened field-matcher synonyms.
- **Why:** Covers Country/State-style dropdowns and more label phrasings.

### `8d783b4` — 2026-07-14 · Radio groups + checkboxes
- **What:** Answer radio-group questions (work authorization, sponsorship, EEO)
  by matching the fieldset legend / ARIA label; tick affirmative checkboxes but
  never consent/terms/privacy/subscribe boxes.
- **Why:** Many application questions are radios/checkboxes, not text — with a
  hard safety line around consent.

### `cc3a777` — 2026-07-14 · Learn & remember unknown fields (local, private)
- **What:** Capture what you type (text/select/radio) keyed by field label into
  `chrome.storage.local`, and use it as a fallback after the built-in matchers.
  Checkboxes are never learned. Popup gains a Learn toggle, count, and Clear.
- **Why:** Fields the extension doesn't know get filled automatically next time,
  on any site — without ever auto-learning a consent box.

### `43b5724` — 2026-07-16 · Answer-bank types + `answers.sample.json` seed
- **What:** `AnswerEntry` (question + aliases + type + value/options) and
  `AnswerBank` (profile + answers) in `@smartapply/shared`; a committed
  `data/answers.sample.json` template; `data/answers.json` gitignored.
- **Why:** The extension could only fill fixed profile fields and whatever it
  auto-learned. This models a **curated** Q&A bank for the free-form questions
  applications ask, with aliases so one entry matches many phrasings.

### `cdfe755` — 2026-07-16 · Fill forms from the curated answer bank
- **What:** `matchAnswer()` scores an entry by the longest matching
  question/alias and wires it into `fillForm`/`fillChoices`. Fill precedence is
  now **profile field → curated answer bank → auto-learned answer**. The consent
  guard still runs first; curated checkboxes tick only on an explicit
  affirmative value.
- **Why:** Makes the curated answers actually do something — one good "notice
  period" or "sponsorship" entry fills across differently-worded forms, while the
  consent safety line is preserved.

### `cedc887` — 2026-07-16 · Options-page UI + import/export
- **What:** A full-tab Options page (`options.html`/`options.js`) to edit the
  profile and add/edit/delete answer-bank entries, and Import/Export the whole
  thing as `answers.json`. `profile.js` gained load/save + serialization
  helpers; the popup gained a "Manage answer bank & profile…" button.
- **Why:** Curated answers are only useful if they're easy to maintain — the
  300px popup was too cramped, and there was no way to move answers between the
  browser and the repo file. This is the UI the feature hangs on.

---

## Documentation

### `5e90313` — 2026-07-15 · Capabilities reference doc
- **What:** `docs/CAPABILITIES.md` — a single reference of everything Part 1 and
  Part 2 can do (connectors, dedup, scheduler, `.env` keys, autofill, learning,
  storage locations, DOM handling, the pipeline contract). Linked from the root
  README.
- **Why:** One discoverable place describing all capabilities so far.

### `dc0ac88` — 2026-07-16 · Document the answer bank, Options page & `answers.json`
- **What:** Updated `docs/CAPABILITIES.md` (new capability, storage row,
  Options/`answers.json` section, updated key-files & shared-types), the
  extension README, and the root README.
- **Why:** The answer bank changed how forms get filled (new precedence) and
  introduced a repo data file with a real privacy boundary — both need to be
  documented, not just coded.
