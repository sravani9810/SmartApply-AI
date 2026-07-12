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
- `src/excel/workbook.ts` — upserts postings into the workbook (keyed by `id`,
  so re-runs update rather than duplicate).
- `src/index.ts` — `runJobSearch()` orchestrator; run it on an hourly schedule.

## Run

```bash
npm run build
npm run search   # from the repo root
```
