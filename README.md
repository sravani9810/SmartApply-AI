# SmartApply-AI — Autofill Extension & Resume Matcher (Parts 2 & 3)

> This branch (`feature/autofill-resume-matcher`) contains **Parts 2 and 3**,
> plus the shared data model. **Part 1** (job discovery + Excel logging) lives on
> the `feature/job-search-excel` branch.

## Part 2 — Autofill extension — [`packages/autofill-extension`](packages/autofill-extension)
A Chrome (Manifest V3) extension that auto-fills — and optionally submits — job
application forms from a saved applicant profile. Load `src/` as an unpacked
extension; no build step.

## Part 3 — Resume matcher — [`packages/resume-matcher`](packages/resume-matcher)
Scores a resume against a job description with Claude (`claude-opus-4-8`) and can
tailor the resume to the JD. Returns a `MatchResult` whose `fitScore` feeds back
into the Part 1 workbook.

## Packages

```
packages/
  shared/              # common types (JobPosting, MatchResult, connectors)
  autofill-extension/  # Part 2 — Chrome MV3 autofill
  resume-matcher/      # Part 3 — AI JD/resume matching
```

## Setup

```bash
npm install
npm run build          # builds the TypeScript packages (Part 3 + shared)
```

- **Part 3:** `npm run match` (needs `ANTHROPIC_API_KEY`)
- **Part 2:** load `packages/autofill-extension/src` at `chrome://extensions`

Each package has its own README with details.
