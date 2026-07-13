# @smartapply/autofill-extension (Part 2)

A Chrome (Manifest V3) extension that (a) knows **which job you're applying to**
(from the jobs your Part 1 pipeline found) and lets you track application status,
and (b) auto-fills — and optionally submits — application forms from a saved
profile.

## Job context — connected to your pipeline

The extension consumes the jobs your pipeline discovered so it can tell you which
posting the current tab corresponds to, and record your application status back:

```
Part 1 pipeline ──writes──▶ jobs-export.json ──load──▶ Extension
Extension ──"Export status updates"──▶ status-updates.json ──read──▶ Part 1 pipeline ──▶ Sheet
```

- **Load jobs** — in the popup, pick your `jobs-export.json` (see
  [`examples/jobs-export.sample.json`](examples/jobs-export.sample.json)). Jobs
  are stored in `chrome.storage.local`.
- **This job** — the popup matches the current tab's URL to a loaded job
  (by Indeed `jk`, or overlapping URL path) and shows its title/company/status.
  If it can't match, pick the job manually from the dropdown.
- **Mark Applied / Skipped** — records status locally per job.
- **Export status updates** — downloads `status-updates.json` for the pipeline
  to read back into the workbook/sheet (statuses are preserved there on
  re-fetch). File shapes live in `@smartapply/shared` (`JobsExport`,
  `StatusUpdatesFile`).

> The Part 1 side (emitting `jobs-export.json` and importing `status-updates.json`)
> is the connecting step on the `feature/job-search-excel` branch.

## Autofill

- **`popup.html` / `popup.js`** — edit and save your profile (name, email,
  phone, LinkedIn, website) to `chrome.storage.sync`; buttons to **Fill** or
  **Fill & Submit** the form in the active tab.
- **`content.js`** — matches each form field by its name/id/label/placeholder
  against `FIELD_MATCHERS`, sets values in a way React/Vue controlled inputs
  detect, and can click the submit button.
- **`background.js`** — service worker that seeds an empty profile on install
  and relays autofill requests to the active tab.
- **`jobs.js`** — job store: import/load jobs, match the current URL, and track
  status.

## Load it (unpacked)

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select `packages/autofill-extension/src`.
3. Pin the extension, fill in your profile, open a job application, click
   **Fill** (or **Fill & Submit**).

No build step — the `src/` folder is the extension. `manifest.json` references
`background.js`, `content.js`, and `popup.html` by relative path.

## Extending

- Add fields: extend `DEFAULT_PROFILE` and `FIELD_MATCHERS` in `profile.js`
  (popup) and the mirrored `FIELD_MATCHERS` in `content.js`.
- Site-specific rules: branch on `location.hostname` in `content.js` for boards
  with non-standard forms (Workday, Greenhouse, Lever).
