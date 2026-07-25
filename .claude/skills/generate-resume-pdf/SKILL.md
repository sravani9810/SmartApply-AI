---
name: generate-resume-pdf
description: >-
  Create, edit, or export a résumé/CV to PDF using the Part 4 resume-builder
  (packages/resume-builder, a Next.js app). Use this whenever the user wants to
  build/tweak a résumé, change what's on their CV, switch or add a résumé
  "style"/variant, edit a résumé inline in the builder's preview, manage the
  saved-résumé library, render a tailored résumé to PDF, run the resume builder,
  or programmatically turn ResumeData JSON into a downloadable PDF — including
  when a tailored résumé comes out of the hub/matcher and needs to become the
  actual PDF they submit. Covers the ResumeData shape, the variants system, the
  inline WYSIWYG editor, the saved-résumé JSON library, the /api/cv endpoint,
  and the puppeteer/PDFShift gotchas. For the HUB's résumé composer/library
  (packages/hub, the SQLite-backed `/build` + `/resumes` flow), use
  hub-resume-composer instead — this skill is only the Part 4 builder.
---

# Generate a résumé PDF (Part 4)

`@smartapply/resume-builder` renders a résumé from a **`ResumeData` JSON**
object into a formatted PDF (Next 12, `pages/` router). There's a browser editor
for building the JSON (now with **inline click-to-edit** on the rendered
résumé), a **saved-résumé library**, and an API route for generating the PDF
programmatically (e.g. from a tailored résumé produced elsewhere in the
pipeline). The hub (Part 0) renders its PDFs by POSTing `ResumeData` to this
app's `/api/cv` — so this package owns the CV template + PDF rendering for the
whole system.

## The data shape

Everything is driven by `ResumeData`, defined in
[`types/cv_types.ts`](../../../packages/resume-builder/types/cv_types.ts) (mirror
of `@smartapply/shared`'s `ResumeData`):

```ts
interface ResumeData {
  personal: {
    name: string; phone?: string; email: string;
    website:  { readable: string; link: string };
    github:   { readable: string; link: string };
    linkedin: { readable: string; link: string };
    skillset: { type: string; label: string;
                skills: { skill: string; level: string; optional?: boolean; new?: boolean }[] }[];
  };
  summary?: string[];   // paragraphs under "Summary"
  skills?: string[];    // one bullet per line; may contain inline <b> and &amp;
  projects?: WorkExperience[];  // rendered under "Personal Project"
  work_experience: { company; position; url; location; start; end; description: string[] }[];
  education:       { degree; university; url; location; start; end; description: string[] }[];
}
```

`skills` and `description` bullets are rendered with `dangerouslySetInnerHTML`,
so inline `<b>…</b>` bolds and HTML entities like `&amp;` render as `&`. Read
the type file before constructing a `ResumeData` so required fields aren't
missed — the React template ([`components/CV.tsx`](../../../packages/resume-builder/components/CV.tsx),
exported as `CV1`) assumes they're present.

**Section order** (shared by every variant, set in `CV.tsx`):
Summary → Skills → Personal Project → Experience → Education.

## Résumé "styles" = variants (the default résumé)

The default résumé is **not** one hardcoded object anymore — résumés are kept as
named variants under
[`data/variants/`](../../../packages/resume-builder/data/variants/):

- `product_fullstack.ts` — product-company / full-stack style: summary-first,
  clean prose bullets (no heavy inline bold), category-labelled skills. **The
  current default.**
- `engineering.ts` — infra / distributed-systems style: skills-heavy, heavily
  bolded inline tech. The previous default, preserved.

[`data/cv_data.ts`](../../../packages/resume-builder/data/cv_data.ts) is a thin
**barrel**: it re-exports `data` from the active variant and defines `EmptyData`.
All consumers (`/api/cv`, the editor, `RevanthResume`) import `data` from here,
so **switching the default is a one-line change** — edit the re-export:

```ts
export { data } from "./variants/product_fullstack"; // active default
// export { data } from "./variants/engineering";     // previous style
```

To add a new style, drop a `data/variants/<name>.ts` exporting
`export const data: ResumeData = {…}`, register it in
[`data/variants/index.ts`](../../../packages/resume-builder/data/variants/index.ts)
(the templates registry the library/editor read), and optionally point the
barrel at it.

## Editing a résumé in the UI

```bash
npm run resume:dev        # from repo root → http://localhost:3000
```

- `/` — the **résumé library** (landing page): lists saved résumés (Open/Delete)
  and the built-in variants as **Templates**, plus "New blank".
- `/editResume?…` — the editor. Query selects what loads: `?id=<slug>` (a saved
  résumé), `?template=<slug>` (a variant from the registry), `?new=1` (blank),
  or nothing (the compiled default `data`).
- **Inline WYSIWYG editing**: the right-hand preview is the live `CV1` in
  `editable` mode. Click any text (name, summary, skills, roles, companies,
  bullets, education) to edit in place; edits commit **on blur** by field path
  via `onFieldEdit`. Plain fields report `textContent`, rich fields (summary,
  skills, bullets) report `innerHTML` so ⌘/Ctrl+B bold survives. Non-editable
  callers (the PDF, `RevanthResume`) pass no `editable` prop and are unchanged.
- **Save / Save as new / rename**: a title field plus buttons; persistence is
  the saved-résumé library below.

## Saved-résumé library (JSON on disk)

Saved résumés live as one JSON file each under
[`data/saved/`](../../../packages/resume-builder/data/saved/) (tracked in git;
`{ title, updatedAt, data: ResumeData }`), served by a small CRUD API over
[`utils/resumeStore.ts`](../../../packages/resume-builder/utils/resumeStore.ts):

- `GET /api/resumes` — list; `POST /api/resumes` — create (Save as new).
- `GET|PUT|DELETE /api/resumes/[id]` — read / overwrite (Save) / delete.

Ids are slugs (charset-restricted for path safety). This is the builder's *own*
library and is separate from the hub's SQLite `resumes` table — don't conflate
them (the hub library is `hub-resume-composer`).

## Generating a PDF programmatically

With the dev server running, POST to `/api/cv`
([`pages/api/cv.ts`](../../../packages/resume-builder/pages/api/cv.ts)):

```bash
curl -s -X POST http://localhost:3000/api/cv \
  -H 'Content-Type: application/json' \
  -d '{ "resumeData": { ...ResumeData... }, "fileName": "jane_doe.pdf" }' \
  -o resume.pdf
```

- Omit `resumeData` to render the default (barrel `data`). Add `?download` for a
  `Content-Disposition` attachment header. A plain **GET** also renders the
  default (what `pdf:download` uses).
- Verify: response is `application/pdf` and `file resume.pdf` reports a valid PDF
  (the product default renders as ~3 pages; older 2-page note was the old data).

This POST path is the bridge from a **tailored résumé** to the actual PDF — build
the adjusted `ResumeData`, POST it, save the file. The hub's
`/api/resume/[id]/pdf` does exactly this.

## One-time setup (local PDF export)

Local export renders via headless Chrome driven by puppeteer, installed once. If
skipped, `/api/cv` returns a 500 with `Could not find Chrome`.

```bash
npm install
npx puppeteer browsers install chrome    # from packages/resume-builder (or repo root)
```

The binary lands in `packages/resume-builder/.cache/` (gitignored) — don't
commit it.

## Dev vs. production rendering

`/api/cv` branches on `env` in the request body:

- **Local / dev (default):** renders with **puppeteer**. Offline, no key. The
  right path for local-first use.
- **Production:** renders via the **PDFShift** API (needs an account + `apiKey`
  from the editor UI, stored in localStorage). Only exists because serverless
  deploys can't run puppeteer. Don't set `env: "production"` for local work.

## Gotchas

- **500 `Could not find Chrome`** → run the one-time `npx puppeteer browsers
  install chrome`.
- **Missing styles in the PDF** → the HTML references `/build.css`; run
  `npm run build:styles` (the `pdf:*` scripts already do this) so
  `public/build.css` exists.
- **Next 12** — don't reintroduce `target: 'serverless'` in `next.config.js`
  (breaks `next dev`/`build`). Also: `next/link` needs an `<a>` child (no
  `className` directly on `Link`).
- **Inline-edit caret jumps** → only commit editable fields on blur, never
  re-render them mid-typing; that's why edits are captured `onBlur`.
- **cwd resets** — many shell tools reset cwd between calls; pass the package
  path explicitly (e.g. `npx tsc -p packages/resume-builder/tsconfig.json`).
