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
  credentials.
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
