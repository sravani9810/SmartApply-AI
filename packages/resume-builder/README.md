# @smartapply/resume-builder — Part 4

Creates a CV/résumé PDF from a data-driven `ResumeData` JSON. Part 4 of
[SmartApply-AI](../../README.md).

Originally based on the template from
https://github.com/yhabib/nextjs-pdf-cv-generator. Built with:

- Next.js
- tailwindcss
- puppeteer (local PDF export)
- PDFShift API (production PDF export)

## Run it (from the repo root)

```bash
npm install
npx puppeteer browsers install chrome   # one-time: headless Chrome for local PDF export
npm run resume:dev                       # dev server → http://localhost:3000
npm run resume:build                     # production build
npm run resume:start                     # serve the production build
```

Or from inside this package: `npm run dev` / `npm run build` / `npm run start`.

- Editor UI: http://localhost:3000/editResume — build/edit the résumé JSON,
  import/export it, and download the PDF.
- Sample data lives in [`data/`](data); the résumé shape is
  [`types/cv_types.ts`](types/cv_types.ts) (`ResumeData`).

## PDF export modes

The [`/api/cv`](pages/api/cv.ts) route renders the résumé to PDF two ways:

- **Local / dev** — uses **puppeteer** with the Chrome installed above. Fully
  offline; no API key.
- **Production** — uses the **PDFShift** API. Serverless deployments can't run
  puppeteer (no long-lived Node process), so create a
  [PDFShift](https://pdfshift.io) account and enter its API key in the editor UI.
  For local-first use you don't need this — just run in dev mode.

Read more about the original approach
[here](https://yusefhabib.com/blog/a-programmatically-generated-cv).
