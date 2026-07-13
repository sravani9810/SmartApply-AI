# SmartApply-AI — Job Search (Part 1)

> This branch (`feature/job-search-excel`) contains **only Part 1**: job discovery
> and Excel logging, plus the shared data model it depends on. The other two
> parts — the autofill Chrome extension and the resume matcher — live on a
> separate branch.

Searches configured job boards and logs each posting to a structured Excel
workbook. Designed to run on your local machine (which can reach the portals),
on an hourly schedule.

## What it saves

One row per job in `data/jobs.xlsx`:

- **Link** to the posting
- **Date Posted** and **End Date** (when the board exposes them)
- **Recruiter contact** — name, **email**, **phone** (when available)
- Tracking fields: source, status, fit score, captured-at (first seen) and
  last-seen-at (refreshed each run, so you can tell which jobs are still live)

## Packages

```
packages/
  shared/        # common types (JobPosting, connectors, MatchResult)
  job-search/    # Part 1 — discovery + Excel logging
data/            # generated workbooks
```

- [`packages/job-search`](packages/job-search) — connectors, recruiter
  enrichment hook, Excel writer, and the `runJobSearch()` orchestrator.
- [`packages/shared`](packages/shared) — the `JobPosting` model shared across
  all three parts.

## Setup & run

```bash
npm install
npm run build

# reference pipeline (synthetic connector -> Excel)
npm run search

# import a captured Indeed search into the workbook
node packages/job-search/scripts/import-indeed.mjs
```

## Update your search (job title & location)

Search preferences live in `.env` — no code editing, no rebuild:

```bash
JOB_KEYWORDS=software engineer, typescript   # job title / keywords
JOB_LOCATION=Remote                          # e.g. "Bengaluru, India", "New York, NY"
JOB_POSTED_WITHIN_DAYS=7                      # recency filter
```

Edit `.env`, save, and the next run picks it up. (Copy `.env.example` to `.env`
if you haven't yet.)

**Multiple searches** (optional) — run several title/location combos in one go;
all feed the same sheet (deduped):

```bash
JOB_SEARCHES=software engineer @ Remote | data analyst @ Bengaluru, India
```

`JOB_SEARCHES` overrides `JOB_KEYWORDS`/`JOB_LOCATION` when set.

## Setup levels

The pipeline works with or without Google — pick what you need:

**Minimal setup (local only, no Google account)**
1. `npm install && npm run build`
2. `npm run login:indeed` (sign into Indeed once)
3. Set `INDEED_ENABLED=true` and your `JOB_*` prefs in `.env`
4. `npm run search` → jobs saved to **`data/jobs.xlsx`** locally.

That's it — no service account, no cloud. Google Sheets is skipped automatically
when `GOOGLE_SHEETS_SPREADSHEET_ID` is unset.

**Full setup (adds Google Sheets sync)**
- Do the minimal steps, then add a service account + `GOOGLE_SHEETS_SPREADSHEET_ID`
  (see [job-search README → Google Sheets sync](packages/job-search/README.md#google-sheets-sync-optional)).
- Every run then also upserts into your own Google Sheet.

## Hourly scheduler — on/off

The pipeline can run automatically every hour (macOS `launchd`). Toggle it with:

```bash
npm run schedule:on       # turn hourly runs ON
npm run schedule:off      # turn hourly runs OFF
npm run schedule:now      # run once, right now
npm run schedule:status   # check if it's on
```

`off` persists across reboots. Scheduled runs require the laptop to be **awake
and logged in** (a headed Chrome window opens briefly each run — Indeed blocks
headless). See the [job-search README](packages/job-search/README.md#hourly-scheduling-macos-launchd)
for setup details and caveats.

## Captured data

- [`packages/job-search/data/indeed-software-engineer-remote.json`](packages/job-search/data/indeed-software-engineer-remote.json)
  — a real Indeed capture (Software Engineer · Remote): 15 roles with title,
  company, location, and link.
- `data/jobs.xlsx` — the workbook those rows were imported into.

> Note on gaps: Indeed's list view does not expose date-posted, end date, or
> recruiter contact, so those columns are empty for Indeed rows. Boards like
> LinkedIn/Naukri, or a contact-lookup provider via the `enrichRecruiter` hook,
> are needed to fill them.
