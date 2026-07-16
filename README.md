# SmartApply-AI

An automated, **local-first** job-search pipeline, organized into three parts:

1. **Job Search (Part 1)** — discovers job postings and logs each one to a
   structured Excel workbook (and, optionally, Google Sheets), on an hourly
   schedule.
2. **Autofill Extension (Part 2)** — a Chrome (Manifest V3) extension that knows
   which job you're applying to, auto-fills application forms from a saved
   profile, and learns answers to unknown fields.
3. **Resume Matcher (Part 3)** — scores/tailors a resume against a job
   description. *(In progress on its own branch.)*

Everything runs on your own machine. Nothing leaves your computer except the
**optional** Google Sheets sync you explicitly configure.

## Packages

```
packages/
  shared/              # common types (JobPosting, JobsExport, AnswerBank, MatchResult…)
  job-search/          # Part 1 — discovery + Excel/Sheets logging + scheduler
  autofill-extension/  # Part 2 — Chrome MV3 extension
  resume-matcher/      # Part 3 — resume ↔ JD matching
data/                  # generated workbooks
```

## Part 1 — Job Search, Excel & Scheduler

Searches configured job boards and writes one row per job to `data/jobs.xlsx`
(link, date posted/end date, recruiter contact when available, plus tracking
fields). Re-runs upsert by a stable id, so nothing duplicates.

```bash
npm install
npm run build
npm run search               # run the pipeline once

npm run schedule:on          # enable hourly runs (macOS launchd)
npm run schedule:off         # disable
npm run schedule:status      # check
```

Search preferences live in `.env` (`JOB_KEYWORDS`, `JOB_LOCATION`, …) — no code
edits. Google Sheets sync is optional and skipped automatically when unset. See
[`packages/job-search`](packages/job-search) for the full setup, the live Indeed
connector, and scheduler caveats.

## Part 2 — Autofill Extension

Loads the jobs Part 1 found (`jobs-export.json`), matches the current tab to a
posting, tracks Applied/Skipped status, and auto-fills — or Fill & Submits —
application forms from your saved profile. Handles text, radio, checkbox, and
native `<select>` fields, and **learns** answers to unknown fields locally.

Beyond the fixed profile, a curated **answer bank** (`data/answers.json`, edited
in the extension's **Options page**) answers the free-form questions
applications ask — notice period, sponsorship, "how did you hear about us" — with
aliases so one entry matches many phrasings. Fill precedence is profile → answer
bank → learned; consent boxes are never auto-ticked. Start from the committed
`data/answers.sample.json`.

```
1. npm install                       # builds shared types the extension imports
2. chrome://extensions → Developer mode
3. Load unpacked → packages/autofill-extension/src
4. Pin it, fill your profile, load your jobs, open an application, click Fill.
```

See [`packages/autofill-extension`](packages/autofill-extension) for the full
flow (job context, status tracking, autofill, learning, and the pipeline
contract).

## How Parts 1 and 2 connect

```
Part 1 ──writes──▶ jobs-export.json ──load──▶ Extension
Extension ──"Export status updates"──▶ status-updates.json ──read──▶ Part 1 ──▶ Sheet
```

File shapes live in `@smartapply/shared` (`JobsExport`, `StatusUpdatesFile`).

## Capabilities reference

For a single reference of everything the app can do so far — across Part 1 and
Part 2 — see [`docs/CAPABILITIES.md`](docs/CAPABILITIES.md).
