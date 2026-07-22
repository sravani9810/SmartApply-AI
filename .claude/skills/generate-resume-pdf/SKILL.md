---
name: generate-resume-pdf
description: >-
  Create, edit, or export a résumé/CV to PDF using the Part 4 resume-builder
  (packages/resume-builder, a Next.js app). Use this whenever the user wants to
  build/tweak a résumé, change what's on their CV, render a tailored résumé to
  PDF, run the resume builder, or programmatically turn ResumeData JSON into a
  downloadable PDF — including when a tailored résumé comes out of the matcher
  and needs to become the actual PDF they submit. Covers the ResumeData shape,
  the editor UI, the /api/cv endpoint, and the puppeteer/PDFShift gotchas.
---

# Generate a résumé PDF (Part 4)

`@smartapply/resume-builder` renders a résumé from a **`ResumeData` JSON**
object into a formatted PDF. There's a browser editor for building the JSON by
hand, and an API route for generating the PDF programmatically (e.g. from a
tailored résumé produced elsewhere in the pipeline).

## The data shape

Everything is driven by `ResumeData`, defined in
[`types/cv_types.ts`](../../../packages/resume-builder/types/cv_types.ts):

```ts
interface ResumeData {
  personal: {
    name: string;
    email: string;
    website:  { readable: string; link: string };
    github:   { readable: string; link: string };
    linkedin: { readable: string; link: string };
    skillset: { type: string; label: string;
                skills: { skill: string; level: string; optional?: boolean; new?: boolean }[] }[];
  };
  work_experience: { company; position; url; location; start; end; description: string[] }[];
  education:       { degree; university; url; location; start; end; description: string[] }[];
}
```

The default/sample instance the template renders is
[`data/cv_data.ts`](../../../packages/resume-builder/data/cv_data.ts). Read the
type file before constructing a `ResumeData` so required fields aren't missed —
the React template (`components/CV.tsx`) assumes they're present.

## One-time setup (local PDF export)

Local export renders via headless Chrome driven by puppeteer, which needs its
browser binary installed once. If you skip this, `/api/cv` returns a 500 with
`Could not find Chrome`.

```bash
npm install
npx puppeteer browsers install chrome    # from packages/resume-builder (or repo root)
```

The binary lands in `packages/resume-builder/.cache/` (gitignored) — don't
commit it.

## Editing a résumé in the UI

```bash
npm run resume:dev        # from repo root → http://localhost:3000
```

- `/editResume` — build/edit the `ResumeData`, import/export it as JSON, preview,
  and download the PDF.
- `/` — renders the current default data.

For a persistent change to the default résumé, edit
[`data/cv_data.ts`](../../../packages/resume-builder/data/cv_data.ts) to match the
`ResumeData` shape.

## Generating a PDF programmatically

With the dev server running, POST to `/api/cv`
([`pages/api/cv.ts`](../../../packages/resume-builder/pages/api/cv.ts)):

```bash
curl -s -X POST http://localhost:3000/api/cv \
  -H 'Content-Type: application/json' \
  -d '{ "resumeData": { ...ResumeData... }, "fileName": "jane_doe.pdf" }' \
  -o resume.pdf
```

- Omit `resumeData` to render the default `data/cv_data.ts`.
- Add `?download` to the URL to set a `Content-Disposition` attachment header.
- A plain **GET** to `/api/cv` also works (renders the default data) — that's
  what the package's `pdf:download` script uses.
- Verify success: the response is `application/pdf` and `file resume.pdf`
  reports a valid PDF (the sample data renders as 2 pages).

This POST path is the bridge from a **tailored résumé** (e.g. a `ResumeData`
adjusted for a specific job) to the actual PDF a user submits — build the
adjusted object, POST it, save the file.

## Dev vs. production rendering — important

`/api/cv` branches on `env` in the request body:

- **Local / dev (default):** renders with **puppeteer**. Fully offline, no key.
  This is the right path for local-first use.
- **Production:** renders via the **PDFShift** API, which needs an account and an
  `apiKey` (entered in the editor UI, stored in localStorage). Serverless
  deploys can't run puppeteer — that's the only reason this path exists. For
  local work, do not set `env: "production"`; you'd need a paid third-party key
  for no benefit.

## Gotchas

- **500 `Could not find Chrome`** → run the one-time `npx puppeteer browsers
  install chrome`.
- **Missing styles in the PDF** → the HTML references `/build.css`; run
  `npm run build:styles` (the `pdf:*` scripts already do this) so
  `public/build.css` exists.
- **Wrong Next behavior after edits** → this app is Next 12; don't reintroduce
  `target: 'serverless'` in `next.config.js` (removed during monorepo adoption —
  it breaks `next dev`/`build`).
