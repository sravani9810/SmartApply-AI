# SmartApply-AI — Autofill Extension (Part 2)

> This branch (`feature/autofill-extension`) contains **Part 2**: the Chrome
> autofill extension, plus the shared data model. **Part 1** (job discovery +
> Excel/Sheets) lives on `feature/job-search-excel`; the resume matcher (Part 3)
> lives on its own branch.

A Chrome (Manifest V3) extension that:

1. **Knows which job you're applying to** — it loads the jobs your Part 1
   pipeline found (`jobs-export.json`), matches the current tab to a posting, and
   lets you **track application status** (Applied / Skipped), which you export
   back to the pipeline (`status-updates.json`).
2. **Auto-fills** application forms from a saved profile — **Fill** or
   **Fill & Submit**.

## Packages

```
packages/
  shared/              # common types (JobPosting, JobsExport, StatusUpdates…)
  autofill-extension/  # Part 2 — Chrome MV3 extension
```

## Load it (unpacked)

1. `npm install` (only needed to build `shared`; the extension itself has no build)
2. Open `chrome://extensions`, enable **Developer mode**
3. **Load unpacked** → select `packages/autofill-extension/src`
4. Pin it, load your jobs, fill in your profile, and go.

See [`packages/autofill-extension`](packages/autofill-extension) for the full
flow (job context, status tracking, autofill, and the pipeline contract).
