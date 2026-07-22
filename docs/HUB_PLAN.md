# SmartApply Hub — Plan (Part 0)

The parent application that connects Parts 1–4: ingest jobs, curate a reusable
résumé content library, tailor per job with Claude, render PDFs, feed the
autofill extension over localhost, and track every application. **Local-first** —
nothing leaves your machine except Claude calls (via your Claude subscription)
and the optional Google Sheets sync.

Status: **planning**. This doc is the reference we build from.

---

## 1. Goal

Today the parts talk through *files* (`jobs.xlsx`, `jobs-export.json`,
`status-updates.json`). The hub replaces those hand-offs with **one datastore + a
localhost API + a UI**, and adds the missing pieces: a reusable résumé content
library, Claude-driven tailoring, and end-to-end application tracking
(*which résumé went to which job*).

---

## 2. Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │        SmartApply Hub  (Next.js, local)      │
                    │                                              │
   job-search  ───▶ │  ingest   ┌──────────────┐   UI (dashboard) │
   (Part 1)         │  ────────▶│   SQLite DB   │◀──── React pages │
                    │           │ jobs·library· │                  │
   Claude Agent ◀──▶│  tailor   │ flavors·apps  │   API routes     │
   SDK (subscrip.)  │           └──────────────┘   /api/*          │
                    │  resume-builder (CV1 → PDF)        ▲          │
                    └────────────────────────────────────┼──────────┘
                                                         │ localhost fetch
                                                         ▼
                                                 autofill-extension
                                                 (Part 2, MV3)
```

---

## 3. Stack decisions

| Area | Decision | Status |
|---|---|---|
| App | **Next.js** (App Router, current version), new package | default (rec) |
| Placement | **`packages/hub`**; `resume-builder` becomes the render lib (exports `CV1` + `ResumeData` + PDF route) | default (rec) |
| DB | **SQLite** + **Drizzle** ORM + `sqlite-vec` for embeddings | default (rec) |
| AI (Phase 4) | **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`), **billed to the Claude subscription** via `claude` CLI subscription login — **locked** | ✅ |
| Extension link | localhost HTTP API + CORS (Native Messaging later if needed) | locked |
| Desktop | stay web; optional Tauri wrapper in Phase 7 | locked |

Two defaults above (`packages/hub`, Drizzle) can still be overridden before
Phase 0.

### Repo layout after

```
packages/
  shared/          types incl. new Library/Flavor/Application contracts
  job-search/      Part 1 — called by the hub as a library (+ keeps scheduler)
  autofill-extension/  Part 2 — switched to localhost fetch
  resume-builder/  Part 4 — render lib (CV1 + PDF)
  hub/             ★ Part 0 — Next.js app: DB, UI, API, Claude, orchestration
```

---

## 4. Data model — content library, not "a résumé"

Store a curated **content library** and treat each résumé as a *view* over it.
Reuse-and-select, not regenerate. Three layers:

```
Layer 1: CONTENT LIBRARY (truthful, curate once)
   experiences · bullet pool (variants + tags) · skills · summary snippets · projects · education
                          │ select + order
Layer 2: FLAVORS (reusable presets: Frontend · Backend · SDE · Cloud)
   which summary · skill emphasis · which bullets per experience · page budget
                          │ light per-JD adjustment (from approved pool only)
Layer 3: PER-JOB RÉSUMÉ (compiles to ResumeData → PDF)
   stored on the application: flavor + exact bullet ids + PDF hash
```

Facts (company, title, dates) are **single-source** — split from bullets — so
versions can't drift (prevents inconsistency flags). Only **approved** content is
ever emitted; Claude *selects/ranks*, it doesn't fabricate.

### Storage: relational, with graph-shaped edges + vectors

The relationships are a graph, but the scale is tiny — model it in SQLite, not a
graph DB. Tables (Drizzle):

```
experiences(id, company, title, start, end, location, url)      -- facts
bullets(id, experience_id, metric, approved)
bullet_variants(id, bullet_id, text, embedding)                 -- phrasings + vector
tags(id, name, category)
tag_edges(parent_tag_id, child_tag_id, kind)                    -- ontology (React→Frontend)
skills(id, name, category) / skill_tags(skill_id, tag_id)
bullet_tags(bullet_id, tag_id)
summary_snippets(id, text) / summary_snippet_tags(...)
flavors(id, name) / flavor_bullets(flavor_id, experience_id, bullet_id, ord)
jobs(id, …, description) / job_tags(job_id, tag_id, weight)
resumes(id, flavor_id, resume_data_json, pdf_hash)              -- compiled snapshot
applications(id, job_id, resume_id, status, applied_at)
application_bullets(application_id, bullet_id)                  -- exactly what was sent
learned_answers(...)                                            -- from the extension
```

- **`tag_edges`** is the only "graph" — traversed 1–2 hops in memory for
  transitive matching. No graph engine.
- **Embeddings** (`bullet_variants.embedding`, job description) give fuzzy recall
  alongside explicit tag matches: `score = w1·tagOverlap + w2·cosineSim`.
- **`resumes.resume_data_json`** is a frozen `ResumeData` snapshot (what `CV1`
  renders) — immutable provenance per sent résumé.

`compile(flavor, library) → ResumeData` renders through the existing `CV1`
template unchanged.

---

## 5. Phases

Each phase is independently useful.

### Phase 0 — Scaffolding
Create `packages/hub` (Next app), wire into workspaces + tsconfig. Add
SQLite + Drizzle + migrations. Extract `CV1`/`ResumeData`/PDF into an importable
module in `resume-builder`. **Unlocks:** app boots, DB connects, can render a PDF.

### Phase 1 — Data layer + seed from real data
Implement the schema. **Seed script:** convert current
`packages/resume-builder/data/cv_data.ts` into `experiences` + tagged `bullets`;
import existing `jobs.xlsx` into `jobs`. Data-access layer. **Unlocks:** whole
résumé + job history queryable in one store.

### Phase 2 — Hub UI (browse + curate)
Dashboard (jobs list, filters, job detail), library editor (experiences,
bullets + variants + tags, skills, flavors), applications view. **Unlocks:**
usable as a tracker + content manager before any AI.

### Phase 3 — Job ingestion wired in
Hub calls `runJobSearch()` → upserts `jobs` by id (dedup). Repoint launchd
scheduler at a hub ingest endpoint; add status write-back. **Unlocks:** scraped
jobs flow in, deduped, on schedule.

### Phase 4 — Tailoring (library → flavor → PDF, with Claude)  ★ subscription
- `compile(flavor, library) → ResumeData → PDF`.
- `rankBullets(job)` = `tag_edges` traversal + `sqlite-vec` similarity.
- **Claude selects/orders** the top approved bullets + produces `MatchResult`
  (fit, matched/missing skills) + gap flags. New phrasings enter the library as
  *unapproved variants* you approve once.
- **Runs on the Claude Agent SDK against your subscription** (see §6).
- Review UI: see selection, tweak, render, save as a `resume` bound to the app.
- **Unlocks:** per-job tailored résumés by reuse-and-select, not fabrication.

### Phase 5 — Extension bridge
Hub exposes `GET /api/jobs`, `GET /api/profile`,
`GET /api/application/:jobId` (answers + which résumé), `POST /api/status`; CORS
for the extension origin. Update the extension to `fetch` localhost instead of
manual JSON; add `host_permissions` for `http://localhost:*`. **Unlocks:** live
per-job data to the extension; no file dance.

### Phase 6 — Semi-auto apply loop
From a job: pick flavor → tailor → render PDF → open application → extension
fills → **you** review, attach the PDF, submit → status auto-recorded. Submit and
file-attach stay manual (browser + irreversibility limits). **Unlocks:** the full
loop with a human gate at submit.

### Phase 7 — (optional) Packaging & polish
Tauri wrapper (tray, launch-on-login), local backups, an **ATS-safe flavor**
(plain single-column render).

---

## 6. Claude integration (Phase 4 only)

**Only Phase 4 calls Claude.** It's a single structured *selection* call, not an
open-ended agent — but it runs through the **Claude Agent SDK** so usage bills to
the **Claude subscription** rather than per-token API.

- Package: **`@anthropic-ai/claude-agent-sdk`** (TypeScript, matches the hub).
- Auth: install the **`claude` CLI → "Log in with your subscription account"** →
  the hub's server process uses that login. **You** set this up; no API key, no
  key in the extension/browser.
- Call: `query(prompt, options)` — runs the agent loop in-process. Prompt Claude
  to return JSON (selected `bulletId[]` + `MatchResult`); validate with **Zod**.
- Model: whatever the subscription grants; keep the call cheap (only tailor jobs
  you actually apply to).
- Reference: Agent SDK docs at `code.claude.com/docs/en/agent-sdk` (a different
  surface than the raw Messages API).

Subscription usage is subject to plan rate/usage limits and Anthropic's terms for
subscription-based programmatic use — fine for a personal, low-volume hub; API
billing is the path if volume ever grows.

---

## 7. Cross-cutting

- **Truthfulness & safety:** Claude only selects/rephrases *approved* content; a
  human reviews before every submit; nothing auto-submits; résumé file upload
  stays manual (browser rule).
- **Provenance:** every sent résumé is a frozen `ResumeData` + `pdf_hash` on the
  application, with the exact bullet ids used.
- **Local-first preserved:** SQLite on disk; only Claude (subscription) + optional
  Sheets leave the machine. No cloud sync unless added later.
- **Verification per phase:** seed round-trips to a PDF; ingest dedups; tailoring
  produces a valid `ResumeData`; extension fetches real data.

---

## 8. Open items (confirm before Phase 0)

1. New `packages/hub` vs. evolve `resume-builder` — *default: new hub*.
2. Drizzle vs. Prisma — *default: Drizzle*.
3. Build order — strict phases, or ship the tracker (P1–P2) before tailoring?

Everything else is locked (subscription/Agent-SDK auth, data model, desktop
deferred).
