---
name: hub-resume-composer
description: >-
  Work on the Part 0 hub's résumé composer, résumé library, and in-hub inline
  editing (packages/hub — Next 15 App Router + SQLite/Drizzle). Use this whenever
  the user wants to compose/tailor a résumé for a job in the hub, "find a résumé"
  for a job description, edit a résumé inline inside the hub (not the Part 4
  builder), refine a résumé with Claude, save/rename résumés in the hub library
  (`/resumes`, the `resumes` table), link a résumé to a job so it shows on the
  dashboard row and job page, bulk-manage or reset the hub résumé library, or
  touch the `/build` composer, `resumes`/`applications` schema, or the
  compose/rank/tailor plumbing — even if they just say "my résumé library",
  "the composer", or "connect the résumé to the job". For rendering a résumé to
  an actual PDF, or the Part 4 builder's own editor/variants/JSON library, use
  generate-resume-pdf instead (the hub delegates PDF rendering to it).
---

# Hub résumé composer & library (Part 0)

`@smartapply/hub` (`packages/hub`, Next 15 App Router + better-sqlite3/Drizzle)
owns the résumé **content library**, the composed-résumé **library**, Claude
tailoring, and — as of the in-hub editing work — **inline editing of résumés
directly in the hub** (no bounce to the Part 4 builder). It renders PDFs by
forwarding `ResumeData` to the Part 4 resume-builder; see generate-resume-pdf
for the CV template / PDF side.

## Running it

```bash
npm run hub          # from repo root: hub (:3100) + resume-builder (:3000) together
npm run hub:dev      # hub only (builder already up)
HUB_DISABLE_CLAUDE=1 npx next dev -p 3100   # force deterministic (no Claude), from packages/hub
```

DB lives at `packages/hub/data/smartapply.db` (gitignored; WAL mode). Schema:
`db:migrate`; seed library + jobs: `db:seed`. The hub reaches the builder at
`http://localhost:3000` (override `RESUME_BUILDER_URL`). Pages: `/` dashboard ·
`/build` composer · `/resumes` library · `/resumes/[id]` detail · `/jobs/[id]`.

## Data model (the two "résumé" layers)

1. **Content library** — single-source facts, in `db/schema.ts`: `experiences` →
   `bullets` → `bulletVariants` (only `approved` bullets are ever emitted),
   plus `skills`, `summarySnippets`, `education`, a `tags` ontology, and
   `flavors` (which bullets a preset selects). `lib/compile.ts` compiles a
   flavor + optional bullet `Selection` into a `ResumeData` (pulling `personal`
   from the singleton `profile`).
2. **Composed résumés** — the `resumes` table: a frozen `ResumeData` JSON
   snapshot (`resumeData`) + `label`, `company`, `domain`, `technologies`,
   `targetRole`, `jd`, `instructions`, `usedClaude`. This is the **résumé
   library** the user sees at `/resumes`. `applications` links a `job` to a
   `resume` (`resumeId`, nullable — `onDelete: set null`).

`ResumeData` is the shared shape from `@smartapply/shared` — same object the
Part 4 builder renders. `skills`/bullets may carry inline `<b>` and `&amp;`.

## The compose engine (`lib/compose.ts`)

`composeResume(input)` selects & orders the candidate's **own approved bullets**
and applies edit instructions to skills/summary — via **Claude** (Agent SDK,
`query`, on the user's subscription) with a **deterministic fallback** (tag/flavor
selection + simple add/remove directive parsing). It never fabricates
experience. `HUB_DISABLE_CLAUDE=1` forces the deterministic path.

- **Refine** = the same call with `resumeId` + `current` (a `ComposeState`:
  `{selection, skills, summary}`) + `priorInstructions`, so follow-ups build on
  the résumé's current state.
- `deriveState(resumeData)` reconstructs a refinable `ComposeState` from an
  already-compiled résumé by matching each rendered bullet back to its library
  bullet id. This lets any saved résumé be refined without persisting the plan.

## Server actions (`db/actions.ts`) — the API surface

- `composeResumeAction` — generate (new `resumes` row) or refine in place
  (`resumeId` + `current`). Returns `{data, resumeId, state, meta, instructionsLog, usedClaude}`.
- `saveResumeData(resumeId, data, label?)` — **persist inline edits directly**
  (no recompose). This is the "save my in-hub edits" path.
- `renameResume(resumeId, label)` · `createResumeFromData({data, label, …})`
  (Save-as-new) · `duplicateResume(id)` (fork).
- `findResumesAction(jd)` — **deterministic keyword/tech overlap** ranker over
  the saved `resumes` (`lib/findResumes.ts`; technologies ×3, skills ×2, bullet
  text ×1, company/domain/role ×2). No Claude call. Returns ranked `FoundResume[]`.
- `loadResumeAction(id)` — a saved résumé's `data` + derived `state` + log, for
  opening it in the composer editor.
- `linkResumeToJob(resumeId, jobId)` — upsert the `applications` row so the job
  page shows the résumé and the dashboard reflects it; nudges a `new` job to
  `in-progress`.
- `tailorJob(jobId, flavor)` — Claude selects bullets for a specific job.

## Components (the UI)

- `components/Composer.tsx` (`/build`) — the unified flow: paste JD → **Generate**
  (Claude, new résumé) or **🔎 Find** (rank existing) → pick one → an inline
  editor surface appears in the same page with a **Résumé name** field, a
  **"Ask Claude to change this résumé"** prompt box (refine), **Save** /
  **Save as new** / Download PDF / Open, and the editable preview. Reads `?jobId`
  to prefill the JD from a job and link on save.
- `components/EditableResumePreview.tsx` — **inline contentEditable** résumé.
  Controlled: `data` in, `onChange(next)` out. Commits **on blur** by field
  `path` (plain fields → `textContent`; rich → `innerHTML`). Omit `onChange` for
  read-only. Rendered through the same `ResumeData`, so `<b>`/`&amp;` render as
  markup. `.rp-edit` CSS gives the hover/focus affordance.
- `components/ResumeRefiner.tsx` (`/resumes/[id]`) — the detail-page editor:
  inline edit + rename + **Save** + Claude refine.

**Two edit paths, one working résumé.** Inline edits are free-text saved via
`saveResumeData`. A **Claude refine** reselects from the bullet library and
returns a fully recompiled `ResumeData` (replacing the preview). They coexist;
just know a refine can discard inline free-text that isn't backed by a library
bullet. Both are clearly labeled in the UI.

## Job wiring / entry points

- `/build?jobId=<id>` — composer prefills the JD from the job and links the
  saved résumé to it on save (banner: "Composing for …").
- Job page (`/jobs/[id]`) — "✦ Compose & edit for this job" → `/build?jobId=`.
- Dashboard row (`JobsTable.tsx`) — "✎ résumé" link → `/build?jobId=`.
- Linking = upsert `applications(jobId → resumeId)`; the job page's
  `getTailoringForJob` then shows the résumé + Apply steps.

## PDF

`GET /api/resume/[id]/pdf` POSTs the résumé's `resumeData` to the Part 4
builder's `/api/cv?download=1` (`RESUME_BUILDER_URL`, default :3000). **The
builder must be running** or it 502s. All PDF rendering lives in Part 4 — see
generate-resume-pdf.

## Bulk / library maintenance (reset, backup, seed)

The `resumes` table is plain SQLite — safe to script with `better-sqlite3` when
the dev server is stopped (`pkill -f "next dev"` first; WAL). **Back up before
destructive changes** (`select * from resumes` → JSON) since deletes are
irreversible and null out `applications.resumeId`. `better-sqlite3` is hoisted —
run scripts *from inside `packages/hub`* (a script in another dir can't resolve
it; `node -e` from that cwd can). To insert a résumé directly, `JSON.stringify`
the `ResumeData` into `resume_data` and the tech list into `technologies`.

## Gotchas

- **Statuses** (`lib/status.ts`): `new`, `in-progress`, `applied`, `selected`,
  `rejected`, `not-applying`. There is **no** `matched` — don't invent statuses.
- **FK on delete**: deleting a `resumes` row sets `applications.resumeId` to
  null (doesn't delete the application).
- **Deterministic testing**: run with `HUB_DISABLE_CLAUDE=1` to exercise
  Find/select/inline-edit/save without needing Claude sign-in.
- **Inline edits commit on blur** — click away (or Tab out) before Save to be
  sure the last field is captured; Save reads state, so a same-gesture
  blur+click can race.
- **cwd resets** between shell calls — pass the hub tsconfig/path explicitly
  (`npx tsc -p tsconfig.json` from `packages/hub`).
