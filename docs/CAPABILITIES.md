# SmartApply-AI — Capabilities Reference

A single reference of everything SmartApply-AI can do today ("skills"), across
the two parts built so far. Part 3 (resume matcher) is scaffolded but not
covered here.

Everything runs **locally on your own machine** — no data leaves your computer
except the optional Google Sheets sync you explicitly configure.

| Part | Branch | What it is |
| --- | --- | --- |
| **Part 1 — Job Search** | `feature/job-search-excel` | Finds job postings and logs them to Excel / Google Sheets on an hourly schedule. |
| **Part 2 — Autofill Extension** | `feature/autofill-extension` | Chrome extension that fills application forms and tracks which jobs you've applied to. |
| Part 3 — Resume Matcher | `feature/autofill-resume-matcher` | (Not covered here.) |

---

## Part 1 — Job Search, Excel & Scheduler

**Package:** `packages/job-search` · **Run from:** repo root

### Capabilities

- **Discovers job postings** from pluggable "board" connectors
  (`src/boards/`). Each connector implements `JobBoardConnector` from
  `@smartapply/shared` and is registered in `boards/index.ts`.
  - `example-board` — a synthetic posting so the pipeline runs with **zero
    setup / no credentials**.
  - `indeed-browser` — a **live Indeed** connector (details below).
- **Logs one row per job** to `data/jobs.xlsx`, capturing:
  - Link to the posting, **Date Posted**, **End Date** (deadline, when exposed)
  - **Recruiter contact** — name, email, phone (when available)
  - Tracking fields: source, status, fit score, captured-at, **Last Seen At**
- **Upsert, not duplicate** — rows are keyed by a stable `id`
  (`sha1(source::url)`), so hourly re-runs **update** existing rows instead of
  creating duplicates.
- **Preserves your workflow columns on re-fetch** — `status`, `fitScore`, and
  `capturedAt` (first-seen) are kept when a job is seen again; `Last Seen At`
  refreshes each run. Recruiter fields are preserved when the new fetch has none.
- **Optional Google Sheets sync** — same upsert-by-`id` behaviour, mirrors the
  workbook to a Sheet. Requires a Google service account; **entirely optional** —
  skip it and the app still works with Excel only.
- **Multiple searches in one run** — configure several "keywords @ location"
  queries; results are de-duplicated across them.
- **Hourly scheduler** — a macOS `launchd` agent runs the pipeline at minute 0
  of every hour, with simple on/off/now/status controls.

### Live Indeed connector (Option B — logged-in browser)

Rather than scraping anonymously (which trips Cloudflare / CAPTCHA), the
connector drives a **dedicated Chrome profile you log into once**. Session
cookies are reused every run, so it fetches results *as you*, unattended.

- Uses **Playwright** with your installed Google Chrome (`channel: "chrome"`).
- Runs **headed** (visible) — headless Chrome is blocked by Cloudflare.
- Anti-automation flag (`--disable-blink-features=AutomationControlled`) plus a
  poll that waits for any challenge page to clear before reading results.

### Configuration (repo-root `.env`)

| Key | Purpose | Default |
| --- | --- | --- |
| `JOB_KEYWORDS` | Comma-separated keywords | `software engineer, typescript` |
| `JOB_LOCATION` | e.g. `Remote`, `Bengaluru, India` | `Remote` |
| `JOB_SEARCHES` | Pipe-separated `keywords @ location` entries (multi-search) | — |
| `JOB_POSTED_WITHIN_DAYS` | Only jobs posted within N days | — |
| `JOBS_WORKBOOK_PATH` | Excel output path | `data/jobs.xlsx` |
| `INDEED_ENABLED` | `true` to use the live Indeed connector | `false` (example board) |
| `INDEED_HEADLESS` | `false` to watch the browser | `false` |
| `INDEED_PROFILE_DIR` | Where the logged-in Chrome profile is stored | — |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service-account **JSON key file** (Sheets sync) | — |

> `GOOGLE_APPLICATION_CREDENTIALS` must point at the JSON key file, **not** a
> sheet URL.

### Commands

```bash
npm run build                 # compile
npm run search                # run the pipeline once (from repo root)
npm run login:indeed  -w @smartapply/job-search   # log into Indeed once (stores cookies)
npm run import:indeed -w @smartapply/job-search   # one-off Indeed import

# Scheduler (macOS launchd)
npm run schedule:on     -w @smartapply/job-search   # install + enable hourly runs
npm run schedule:off    -w @smartapply/job-search   # disable
npm run schedule:now    -w @smartapply/job-search   # run once immediately
npm run schedule:status -w @smartapply/job-search   # is it loaded?
```

### Scheduler notes & known constraints

- **Laptop asleep / off:** `launchd` runs at minute 0 of every hour **only while
  the machine is awake**. A missed hour (asleep) runs once at next wake; it does
  not run while powered off.
- **macOS TCC:** `launchd` cannot read `~/Desktop`, `~/Documents`, or
  `~/Downloads` (fails `EX_CONFIG`). The repo therefore lives at
  `~/SmartApply-AI` and the Sheets key at `~/.config/smartapply/service-account.json`.
- Logs: `~/Library/Logs/smartapply/hourly.log`.

### Key files

- `src/columns.ts` — the single 15-column schema shared by every sink
  (`flatten`, `toRowArray`, `mergePreserving`).
- `src/config.ts` — lazy `getConfig()` reading `.env` (lazy so it runs *after*
  dotenv loads).
- `src/boards/indeed-browser.ts` — the Playwright Indeed connector.
- `src/excel/workbook.ts` — Excel upsert (reassigns column keys on load, since
  ExcelJS doesn't persist them).
- `src/sheets/gsheet.ts` — optional Google Sheets sink.
- `src/index.ts` — `runJobSearch()` orchestrator.
- `scripts/schedule.sh`, `deploy/com.smartapply.jobsearch.plist` — scheduler.

---

## Part 2 — Autofill Chrome Extension

**Package:** `packages/autofill-extension` · Manifest V3, **no build step**
(load `src/` unpacked).

### Capabilities

- **Auto-fills application forms** from a saved profile — on **any site**
  (`<all_urls>`), not just Greenhouse/Lever.
  - **Auto-fill on open** (default on) — detects the form as it renders
    (MutationObserver, up to ~20s, since ATS forms load late) and fills it.
  - **Manual** — popup **Fill** / **Fill & Submit** buttons.
- **Field types covered:**
  - **Text / textarea / native `<select>`** — name, email, phone,
    address/city/state/zip/country, LinkedIn, website, current company/title,
    years of experience, cover letter.
  - **Radio groups** — matched by fieldset legend / ARIA (work authorization,
    sponsorship, gender, veteran, disability EEO questions).
  - **Checkboxes** — only affirmative "yes" answers are ticked.
- **Learn & Remember (local, private)** — the headline capability for unknown
  fields:
  - **Captures what you type** on application forms, keyed by the field's label
    (e.g. `"github profile" → github.com/sravani`).
  - **Re-fills that field automatically next time** it sees the same label — on
    *any* site — even though no built-in rule knows it. The more you apply, the
    more it fills.
  - **Never learns checkboxes** — so it can't later auto-tick a terms/consent
    box.
  - Popup controls: **Learn new answers** toggle, learned-count readout,
    **Clear learned answers** button.
- **Knows which job you're applying to** — loads `jobs-export.json` from Part 1,
  matches the current tab (by Indeed `jk` or overlapping URL path), and lets you
  **Mark Applied / Skipped**, exported back as `status-updates.json`.
- **Robust DOM handling** — pierces **Shadow DOM**, fills inside **iframes**
  (`all_frames`, `match_about_blank`), and sets values the way React/Vue
  controlled inputs detect.
- **On-demand injection** via `chrome.scripting.executeScript` (idempotent
  guarded IIFE) — avoids "receiving end doesn't exist" messaging errors.

### Where your data is stored (all in the browser — nothing on disk/server)

| Data | Store | Scope |
| --- | --- | --- |
| **Profile** (name, email, phone, …) | `chrome.storage.sync` | Synced across your signed-in Chrome profiles |
| **Learned answers** (unknown fields) | `chrome.storage.local` | **This machine only — never synced, never sent anywhere** |
| **Jobs + statuses** | `chrome.storage.local` | This machine |

Inspect the raw data from any tab's DevTools console:

```js
chrome.storage.local.get("learned").then(console.log)   // learned answers
chrome.storage.sync.get("profile").then(console.log)    // your profile
```

### Fills only — two hard browser limits (not bugs)

- **Resume/CV upload can't be automated** — browsers forbid scripts from setting
  a file input's value. Attach the file yourself.
- **Submit stays manual** — auto-fill never clicks submit. Use **Fill & Submit**
  deliberately; submitting is irreversible.

### Known coverage gap

- **Custom JS dropdowns** (React-Select / typeahead comboboxes) — learning
  captures native inputs/selects/radios, but a fully custom widget still needs
  dedicated support to *set* its value. Native `<select>` dropdowns are covered.
- **Login / CAPTCHA gates** — pages that gate the form behind a login or CAPTCHA
  (e.g. some `gethired.com` links) have no form to fill until you're through.

### Pipeline contract (Part 1 ⇄ Part 2)

```
Part 1 ──writes──▶ jobs-export.json ──load in popup──▶ Extension
Extension ──"Export status updates"──▶ status-updates.json ──▶ Part 1 ──▶ Sheet
```

File shapes live in `@smartapply/shared` (`JobsExport`, `StatusUpdatesFile`).
The Part 1 side of this contract (emitting `jobs-export.json`, importing
`status-updates.json`) is the remaining connecting step on
`feature/job-search-excel`.

### Load it (unpacked)

1. `npm install` (only to build `shared`; the extension itself has no build).
2. `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select `packages/autofill-extension/src`.
4. Pin it, fill in your profile, load your jobs, open an application, click
   **Fill**.

> After changing extension code, reload it in `chrome://extensions` (↻) **and**
> reload the application tab.

### Key files

- `content.js` — the filler: matchers, radio/checkbox/select handling, Shadow
  DOM + iframe traversal, learn-and-remember (`remember()`), auto-fill-on-open,
  `window.__smartApplyFill`.
- `popup.html` / `popup.js` — profile editor, settings toggles, Fill/Submit,
  learned-answer controls, job-context panel.
- `profile.js` — `PROFILE_FIELDS`, `DEFAULT_SETTINGS`, load/save helpers.
- `jobs.js` — job store: import/load, URL matching, status tracking.
- `background.js` — seeds default settings on install.
- `manifest.json` — permissions `storage`, `activeTab`, `scripting`, `tabs`.

---

## Shared foundation

**Package:** `packages/shared` — common TypeScript types used by both parts:
`JobPosting`, `ApplicationStatus`, `JobBoardConnector`, `JobsExport` /
`JobExportEntry`, `StatusUpdate` / `StatusUpdatesFile`, `MatchResult`.

## Privacy summary

- Part 1 stores jobs in a **local Excel file**; Google Sheets sync is optional
  and only to *your* sheet.
- Part 2 stores profile and learned answers in the **browser's own storage** —
  learned answers (`local`) never leave the machine.
- No third-party servers, no telemetry.
