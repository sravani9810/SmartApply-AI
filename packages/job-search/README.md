# @smartapply/job-search (Part 1)

Discovers job postings from configured boards and logs each one to a structured
Excel workbook.

## What it saves

One row per job in `data/jobs.xlsx`, including the fields Part 1 is responsible
for capturing:

- **Link** to the posting
- **Date Posted** and **End Date** (application deadline), when the board
  exposes them
- **Recruiter contact** — name, **email**, and **phone**, when available
- Tracking fields: source, status, fit score, captured-at timestamp

## Layout

- `src/boards/` — one connector per job board. Implement `JobBoardConnector`
  (from `@smartapply/shared`) and register it in `boards/index.ts`. The bundled
  `example-board` returns a synthetic posting so the pipeline runs with no
  credentials; `indeed-browser` is the live Indeed connector (see below).
- `src/recruiter/enrich.ts` — hook point to fill in recruiter email/phone that
  a board didn't provide.
- `src/columns.ts` — the single column schema (headers + flattening) shared by
  every sink.
- `src/excel/workbook.ts` — upserts postings into the workbook (keyed by `id`,
  so re-runs update rather than duplicate).
- `src/sheets/gsheet.ts` — optional Google Sheets sink (same upsert-by-`id`
  behavior).
- `src/index.ts` — `runJobSearch()` orchestrator; run it on an hourly schedule.

## Run

```bash
npm run build
npm run search   # from the repo root
```

Without any configuration this uses the synthetic `example-board`. To fetch real
jobs, enable the live Indeed connector below.

## Live Indeed connector (Option B — logged-in browser)

Instead of scraping Indeed anonymously (which triggers bot/CAPTCHA walls), the
connector drives a **dedicated Chrome profile that you log into once**. Your
session cookies are stored in that profile and reused on every run, so the
pipeline fetches results *as you*, unattended.

It uses [Playwright](https://playwright.dev/) with your installed **Google
Chrome** (`channel: "chrome"`). Chrome must be installed on the machine.

### Step 1 — Install dependencies

```bash
npm install          # installs Playwright (already a dependency)
```

> The connector uses your system Google Chrome, so no extra browser download is
> needed. (If you ever switch it to bundled Chromium, run
> `npx playwright install chromium`.)

### Step 2 — Enable the connector

In your `.env` (repo root — copy from `.env.example`):

```bash
INDEED_ENABLED=true
```

Optional tuning in `.env`:

```bash
# INDEED_PROFILE_DIR=/Users/you/.config/smartapply/chrome-profile  # where the login is stored
# INDEED_HEADLESS=false                                            # watch the browser while it runs
```

### Step 3 — Log into Indeed once

```bash
npm run login:indeed
```

A Chrome window opens on the Indeed login page. **Sign in** (complete any
verification), then return to the terminal and **press Enter**. Your session is
saved to the profile directory. You only repeat this if Indeed logs you out.

### Step 4 — Run the search

```bash
npm run build
npm run search
```

The connector opens the logged-in profile (headless by default), runs the search
from your config, extracts the postings, and writes them to `data/jobs.xlsx`
(and Google Sheets, if configured). De-dup is by `id`, so only genuinely new
postings are added on later runs.

### What is searched

Search terms come from [`src/config.ts`](src/config.ts):

```ts
query: {
  keywords: ["software engineer", "typescript"],  // -> Indeed "what"
  location: "Remote",                             // -> Indeed "where"
  postedWithinDays: 7,                            // -> Indeed "fromage" (max age)
}
```

Edit those to change the search, then `npm run build && npm run search`.

### Headed only — Cloudflare blocks headless

Indeed is behind **Cloudflare bot protection**. Headless Chrome is hard-blocked
("You have been blocked"), even with a logged-in session. The connector therefore
runs **headed** (a real Chrome window) with the automation fingerprint hidden
(`--disable-blink-features=AutomationControlled`) and waits for Cloudflare's
"Just a moment…" challenge to auto-clear before reading results.

Consequence: **a Chrome window appears briefly on each run** (including scheduled
runs). Do not set `INDEED_HEADLESS=true` — it will be blocked.

### Troubleshooting

- **"Indeed returned no results … Cloudflare bot block"** — make sure
  `INDEED_HEADLESS` is not `true`, and that you are logged in
  (`npm run login:indeed`). If it persists, run `npm run search` and watch the
  window complete the challenge.
- **"Executable doesn't exist" / Chrome not found** — install Google Chrome, or
  switch the connector to bundled Chromium (`npx playwright install chromium`
  and remove `channel: "chrome"` in `src/boards/indeed-browser.ts`).
- **Recruiter contact / dates are blank** — Indeed's list view doesn't expose
  recruiter email/phone, posted date, or an end date. Those columns stay empty
  for Indeed rows.

### Notes & etiquette

- Keep the run cadence gentle (hourly is fine). Scraping is subject to Indeed's
  terms; this is intended for personal, single-user, local use of your own
  account.
- The Chrome profile holds your login — it is gitignored (`chrome-profile/`) and
  lives outside the repo by default. Don't commit or share it.

## Hourly scheduling (macOS launchd)

Runs `runJobSearch()` at the top of every hour via a launchd **LaunchAgent**.

### Important: the project must live outside `~/Desktop`

macOS **TCC** denies launchd agents access to `~/Desktop`, `~/Documents`, and
`~/Downloads`. If the repo (or the Google service-account key) is under one of
those, the scheduled job fails with `EX_CONFIG` / `Operation not permitted`. Keep
the project somewhere like `~/SmartApply-AI` and the key under `~/.config/`.

### Files

- [`packages/job-search/scripts/run-hourly.sh`](scripts/run-hourly.sh) — builds
  then runs the pipeline; logs to `~/Library/Logs/smartapply/hourly.log`.
- [`deploy/com.smartapply.jobsearch.plist`](../../deploy/com.smartapply.jobsearch.plist)
  — the LaunchAgent (paths are machine-specific; edit if your repo path differs).

### Install

```bash
cp deploy/com.smartapply.jobsearch.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.smartapply.jobsearch.plist
launchctl list | grep smartapply        # confirm it's registered
launchctl start com.smartapply.jobsearch # run once now to test
tail -f ~/Library/Logs/smartapply/hourly.log
```

### Manage

```bash
# stop / disable
launchctl unload -w ~/Library/LaunchAgents/com.smartapply.jobsearch.plist
# after editing the plist: unload then load again
```

### Caveats

- **A Chrome window appears each hour** (headed is required — see above).
- The machine must be **awake and logged in** for the agent to fire. If it was
  asleep at the top of the hour, launchd runs the job once on wake.
- Runs are idempotent: dedup by `id`, and workflow columns (Status, Fit Score,
  Captured At) are preserved across runs.

## Google Sheets sync (optional)

The pipeline stays **local-only by default**. If `GOOGLE_SHEETS_SPREADSHEET_ID`
is set, `runJobSearch()` also upserts every posting into a Google Sheet (keyed by
`id`, so manual edits in other columns — e.g. Status — are preserved).

> This sends job data to your Google account, leaving your machine.

### One-time setup (service account)

1. In the [Google Cloud Console](https://console.cloud.google.com/), create (or
   pick) a project and **enable the Google Sheets API**.
2. Create a **Service Account**, then add a **JSON key** and download it. Keep it
   out of git (the repo `.gitignore` ignores `.env`; store the key outside the
   repo or add its path to `.gitignore`).
3. Create a Google Sheet. Copy its **spreadsheet ID** from the URL
   (`https://docs.google.com/spreadsheets/d/<THIS_PART>/edit`).
4. **Share** the sheet with the service account's email (`...@...iam.gserviceaccount.com`)
   as **Editor**. (The service account can only touch sheets you share with it.)

### Configure

Set these in your environment (see `.env.example`):

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json"
export GOOGLE_SHEETS_SPREADSHEET_ID="your-spreadsheet-id"
export GOOGLE_SHEETS_TAB="Jobs"   # optional, defaults to "Jobs"
```

Then run `npm run search` — you'll see a `synced to Google Sheet …` line. The
tab is created automatically if it doesn't exist, and headers are written on
first sync.
