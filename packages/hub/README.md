# @smartapply/hub — Part 0

The local hub that connects Parts 1–4: owns the datastore, the résumé content
library, job ingest, and (later) Claude tailoring + the extension bridge. See
[`docs/HUB_PLAN.md`](../../docs/HUB_PLAN.md) for the full plan.

Next.js 15 (App Router) + SQLite (Drizzle). Local-first — the DB lives at
`packages/hub/data/smartapply.db` (gitignored; regenerate any time).

## Setup

```bash
npm install                       # from the repo root
npm run db:migrate -w @smartapply/hub   # create the schema
npm run db:seed    -w @smartapply/hub   # seed library from cv_data.ts + import jobs.xlsx
npm run dev        -w @smartapply/hub   # → http://localhost:3100
```

Pages: `/` dashboard · `/library` curate · `/jobs/[id]` detail · `/applications`.

## Job ingest (Phase 3)

The hub reuses the Part 1 pipeline (`runJobSearch()` from
`@smartapply/job-search`) and upserts results into SQLite, **deduped by id**.
Existing `status` / `fitScore` / `capturedAt` are preserved on re-ingest; only
descriptive fields and `lastSeenAt` refresh.

```bash
npm run ingest -w @smartapply/hub       # run the pipeline → DB (scheduler entry)
# or from the UI: the dashboard "↻ Refresh from Part 1" button
# or over HTTP:   POST http://localhost:3100/api/ingest
```

Which board runs is controlled by the same `.env` as Part 1 (`INDEED_ENABLED=true`
drives the live Indeed browser board; otherwise the synthetic example board).

### Scheduling

Part 1 ships an hourly launchd scheduler that runs `npm run search`
(writes `jobs.xlsx`). To feed the hub instead, point the schedule at the hub
ingest — either swap the scheduled command to
`npm run ingest -w @smartapply/hub`, or add a cron/launchd job that curls
`POST /api/ingest` while the hub is running. Both paths run the same pipeline and
upsert into the DB. (Part 1's own `search`/`schedule:*` scripts still work
standalone — this is additive.)

## Data model

Content-library model (experiences · tagged bullet pool · tag ontology · skills
· summary · flavors) that compiles to a `ResumeData` for the Part 4 template.
Schema: [`src/db/schema.ts`](src/db/schema.ts). See `docs/HUB_PLAN.md` §4.

## Status

Phases 0–3 done (data layer, seed, dashboard, curate UI, job ingest). Next:
Phase 4 (Claude tailoring on your subscription via the Agent SDK).
