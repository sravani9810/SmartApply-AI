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

Open a job's application (e.g. from the link in your sheet) and the extension
fills the form from your saved profile.

- **Auto-fill on open** (default on) — when an application page loads, the
  content script detects the form (watching the DOM for a few seconds, since
  ATS forms like Greenhouse/Lever/Workday render late) and fills it. Toggle it
  in the popup.
- **Manual** — the popup's **Fill** / **Fill & Submit** buttons act on the
  active tab.
- **Fields covered** — name, email, phone, address/city/state/zip/country,
  LinkedIn, website, current company/title, years of experience, and cover
  letter. Edit the profile in the popup; fields come from `PROFILE_FIELDS` in
  `profile.js` (mirror the matchers in `content.js`).

It fills **only empty fields** (never overwrites what you typed) and matches by
each field's name/id/label/placeholder/aria-label, setting values in a way
React/Vue controlled inputs detect.

## Answer bank & Options page

Beyond the fixed profile fields, you can curate a **question → answer bank** for
the free-form things applications ask (notice period, salary expectation,
sponsorship, "how did you hear about us"). Open the **Options page** — the
popup's *Manage answer bank & profile…* button, or `chrome://extensions` →
Details → Extension options — to edit it.

- Each entry has a **question**, optional **aliases** (so one entry matches many
  form phrasings), a **type** (`text`/`textarea`/`select`/`radio`/`checkbox`), a
  **value**, and optional **options**. When filling, precedence is
  **profile field → answer bank → learned answer**; the longest-matching
  question/alias wins.
- Consent/terms boxes are **never** auto-ticked — a curated checkbox is ticked
  only on an explicit affirmative value.
- **Export / Import `answers.json`** — the whole thing (profile + answers) is one
  `AnswerBank` file (`@smartapply/shared`). Export saves it into your repo's
  `data/` folder; Import loads it back. A browser extension can't read a repo
  file directly, so this is the sync path — same as `jobs-export.json`.
  `data/answers.json` is gitignored; start from the committed
  `data/answers.sample.json`.

### Two hard limits (browser rules, not bugs)

- **Resume upload can't be automated.** Browsers forbid setting a file input's
  value from a script, so you always attach the resume/CV file yourself.
- **Submit stays manual.** Auto-fill never clicks submit — use **Fill & Submit**
  deliberately. Submitting an application is irreversible.

### Files

- **`content.js`** — the filler (matchers, answer-bank matching,
  auto-fill-on-open, form detection).
- **`popup.html` / `popup.js`** — profile editor, auto-fill toggle, Fill/Submit,
  the job-context panel, and the Options-page link.
- **`options.html` / `options.js`** — full-tab profile + answer-bank editor with
  `answers.json` import/export.
- **`background.js`** — seeds settings and relays autofill requests.
- **`jobs.js`** — job store: import/load jobs, match the current URL, track status.

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
