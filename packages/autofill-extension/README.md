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

- **Sync jobs from the Hub** *(recommended)* — click **↻ Sync jobs from Hub** in
  the popup to pull jobs live from the SmartApply Hub (Part 0) over
  `http://localhost:3100/api/jobs`. Set a different Hub URL under *Advanced*.
  (The manual `jobs-export.json` file load still works as a fallback — see
  [`examples/jobs-export.sample.json`](examples/jobs-export.sample.json).) Jobs
  are stored in `chrome.storage.local`.
- **Tailored context** — when the current tab matches a job you tailored in the
  Hub, the popup shows the flavor, fit score, and a **Download tailored PDF** link
  to attach. Marking a job Applied/Skipped **syncs the status back to the Hub**
  automatically (`POST /api/status`), so the Applications view stays current.
- **➕ Add this job & make résumé** — on any job posting, scrape the page
  (title/company/JD) and send it to the Hub (`POST /api/jobs/add`), which creates
  the job, auto-picks the best-fit flavor, and tailors a résumé in one click —
  then returns the fit and a PDF link.

### Claude-assisted fill (for unknown fields)

The **Fill** button fills everything it can match from your profile. For the
questions it can't match, click **🤖 Fill unknowns with Claude**: the popup
collects the still-empty fields and asks the Hub (`POST /api/answer`), which uses
Claude — on your subscription — to answer them from your résumé + the JD, grounded
and truthful (it returns blank for anything needing personal data it doesn't have).
It only fills empty fields and never submits — review before you send.
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
- **Personal info lives in the Hub.** You no longer type your details into the
  extension. Edit them once on the Hub's **Personal info** page
  (`http://localhost:3100/profile`) — name, email, phone, address, LinkedIn,
  work eligibility, EEO, cover letter, etc. — then click **↻ Sync personal info
  from Hub** in the popup. The extension caches those values and fills forms with
  them. The field→value keys mirror the matchers in `content.js`.
- **Unknown fields are pointed out and learned.** When the filler hits a field
  it can't match, it **outlines that field in orange** and scrolls to it. Type
  your answer and it's saved back to the Hub (`POST /api/learned`), so the same
  question fills automatically next time — on any site. Learned answers are
  listed on the Hub's Personal info page.

It fills **only empty fields** (never overwrites what you typed) and matches by
each field's name/id/label/placeholder/aria-label, setting values in a way
React/Vue controlled inputs detect.

## Auto-pilot (agentic, multi-page)

**🚀 Run Auto-pilot** turns the extension into an agent. It runs in the
background service worker (so it survives the popup closing and full-page
navigations) and loops over the whole application:

> **observe → deterministic fill → reason about unknowns → apply → decide**

- **Fast local model first, Claude as backup.** Unknown fields are batched to a
  fast on-device model, and only the leftovers escalate to Claude. Pick the
  engine under **Auto-pilot engine**:
  - `auto` — Chrome built-in (Gemini Nano) → Ollama (Gemma) → Claude (default)
  - `ollama` — local [Ollama](https://ollama.com) running Gemma
    (`ollama run gemma2:2b`), at the URL/model you set
  - `chrome` — Chrome's built-in `LanguageModel` (Gemini Nano) only
  - `claude` — Claude via the Hub only
- **It navigates pages by itself.** When a page is done it clicks
  **Next / Continue** and waits for the next page (SPA step *or* full reload) to
  settle, then repeats — across embedded ATS iframes too.
- **It always stops at Submit.** When it reaches a final **Submit** with no Next,
  or hits a required field it can't answer, it stops and tells you why. It
  **never clicks Submit** — you review and submit yourself (or use **Fill &
  Submit**). Submitting an application is irreversible.
- **Guards:** step limit, loop/no-progress detection, and consent/terms
  checkboxes are never auto-answered.

### Two hard limits (browser rules, not bugs)

- **Resume upload can't be automated.** Browsers forbid setting a file input's
  value from a script, so you always attach the resume/CV file yourself.
- **Submit stays manual.** Auto-fill never clicks submit — use **Fill & Submit**
  deliberately. Submitting an application is irreversible.

### Files

- **`content.js`** — the filler (matchers, auto-fill-on-open, form detection) plus
  the Auto-pilot page primitives (`__smartApplyObserve` / `__smartApplyApply` /
  `__smartApplyNext`). Self-contained — it can't `import`.
- **`agent.js`** — the Auto-pilot orchestration loop (observe → fill → reason →
  navigate → stop at submit). Imported by the background worker.
- **`reasoner.js`** — pluggable reasoning backends (Ollama/Gemma, Chrome built-in
  Gemini Nano, Claude-via-Hub) with the local-first → Claude router.
- **`popup.html` / `popup.js`** — profile editor, auto-fill toggle, Fill/Submit,
  Auto-pilot controls + engine settings, and the job-context panel.
- **`background.js`** — ES-module service worker: seeds settings and hosts the
  Auto-pilot loop (start/stop/progress).
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
