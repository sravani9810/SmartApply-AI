---
name: add-job-board
description: >-
  Add a new job-board connector (LinkedIn, Dice, Greenhouse, Glassdoor, a
  company careers page, etc.) to the Part 1 job-search pipeline in
  packages/job-search. Use this whenever the user wants SmartApply to pull
  jobs from a new source, "add a connector/scraper/board", "support <site>
  jobs", or normalize a new site's postings into the workbook — even if they
  don't say the word "connector". Handles the JobBoardConnector contract,
  registration, dedup, and env gating so the rest of the pipeline stays
  board-agnostic.
---

# Add a job-board connector

Part 1 discovers jobs by running one or more **connectors** and normalizing
whatever each site returns into a single `JobPosting` shape. Every downstream
step — recruiter enrichment, Excel logging, Google Sheets sync, dedup — is
board-agnostic and keys off that shape. So adding a source means writing one
connector and registering it; you touch nothing else.

## The contract

A connector implements `JobBoardConnector` from `@smartapply/shared`:

```ts
interface JobBoardConnector {
  readonly source: string;                        // unique key, e.g. "linkedin"
  search(query: JobSearchQuery): Promise<JobPosting[]>;
}
interface JobSearchQuery {
  keywords: string[];
  location?: string;
  postedWithinDays?: number;                       // honor this if the site supports it
}
```

The canonical source of truth for both types is
[`packages/shared/src/index.ts`](../../../packages/shared/src/index.ts) — read it
before you start so the `JobPosting` fields you emit are current. Do **not**
invent fields; if you need a new one, add it to `@smartapply/shared` so every
sink sees it.

## Steps

### 1. Create the connector file

Add `packages/job-search/src/boards/<source>.ts`. Model it on
[`example-board.ts`](../../../packages/job-search/src/boards/example-board.ts)
(the synthetic reference) — and, for a connector that drives a real logged-in
browser, on
[`indeed-browser.ts`](../../../packages/job-search/src/boards/indeed-browser.ts).

```ts
import type {
  JobBoardConnector, JobPosting, JobSearchQuery,
} from "@smartapply/shared";
import { stableId } from "./example-board.js";   // reuse the dedup id helper

export const linkedinBoard: JobBoardConnector = {
  source: "linkedin",
  async search(query: JobSearchQuery): Promise<JobPosting[]> {
    // 1. Fetch/scrape the board for `query.keywords` / `query.location`,
    //    respecting `query.postedWithinDays` when the site exposes a recency filter.
    // 2. Map each raw result into a JobPosting. Keep the shape identical to the
    //    other boards so the pipeline stays generic.
    return rawResults.map((r) => ({
      id: stableId("linkedin", r.url),   // deterministic → re-runs upsert, don't duplicate
      title: r.title,
      company: r.company,
      location: r.location ?? query.location,
      source: "linkedin",
      url: r.url,
      datePosted: r.datePosted,          // ISO yyyy-mm-dd when available, else undefined
      endDate: undefined,
      description: r.description,
      recruiter: undefined,              // recruiter/enrich.ts fills this later
      status: "new",
      capturedAt: new Date().toISOString(),
    }));
  },
};
```

Key rules, and why they matter:

- **`id` must be a deterministic `stableId(source, url)`.** The workbook upserts
  by id, so a stable id is what makes re-running the search update the same row
  instead of appending a duplicate.
- **`source` is a unique string** and must match the `source` you pass to
  `stableId` and the field on each posting.
- **Set `status: "new"` and a fresh `capturedAt`.** Leave `fitScore`,
  `recruiter`, and `endDate` unset if the board doesn't provide them — later
  stages own those.
- **Import sibling modules with the `.js` extension** (e.g. `./example-board.js`).
  This package is ESM/NodeNext; extensionless imports won't resolve.
- **Never throw for an empty result** — return `[]`. The orchestrator already
  wraps `search()` in try/catch and continues to the next board on error, but a
  clean empty return keeps logs quiet.

### 2. Register it (usually behind an env flag)

Add it to `getActiveBoards()` in
[`boards/index.ts`](../../../packages/job-search/src/boards/index.ts). Follow the
Indeed pattern and gate live/network boards behind an env flag so the pipeline
still runs out-of-the-box with just the synthetic `example` board:

```ts
export function getActiveBoards(): JobBoardConnector[] {
  const boards: JobBoardConnector[] = [];
  if (process.env.INDEED_ENABLED === "true") boards.push(indeedBrowserBoard);
  if (process.env.LINKEDIN_ENABLED === "true") boards.push(linkedinBoard);
  return boards.length ? boards : [exampleBoard];
}
```

`getActiveBoards()` is intentionally a **function, not a module const**: it must
read `process.env` *after* `index.ts` loads `.env`, because ESM evaluates
imports before the dotenv call runs. Keep any new board's env reads inside the
function (or inside `search`) for the same reason. Document the new flag(s) in
[`.env.example`](../../../.env.example).

### 3. Build, run, verify

```bash
npm run build                      # compiles the workspace (tsc)
LINKEDIN_ENABLED=true npm run search   # run the pipeline once
```

Confirm the new postings land in `data/jobs.xlsx` (columns are defined in
[`columns.ts`](../../../packages/job-search/src/columns.ts)) and that a second
run updates rather than duplicates them. If the connector drives a browser and
needs a logged-in session, mirror the Indeed login helper
(`scripts/login-indeed.mjs`) rather than hardcoding credentials.

## Checklist

- [ ] New `boards/<source>.ts` exporting a `JobBoardConnector`
- [ ] Deterministic `stableId(source, url)` for every posting's `id`
- [ ] Postings match the current `JobPosting` shape from `@smartapply/shared`
- [ ] Registered in `getActiveBoards()`, gated behind an env flag if it needs network/login
- [ ] New env flag(s) added to `.env.example`
- [ ] `npm run build && npm run search` produces rows; a re-run upserts (no dupes)
