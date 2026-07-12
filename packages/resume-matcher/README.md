# @smartapply/resume-matcher (Part 3)

Scores a resume against a job description with Claude, and optionally tailors
the resume to the JD.

## API

```ts
import { matchResume } from "@smartapply/resume-matcher";

const result = await matchResume(resumeText, jobDescriptionText, { tailor: true });
// -> { fitScore, matchedSkills, missingSkills, summary, tailoredResume? }
```

`matchResume` returns the `MatchResult` shape from `@smartapply/shared`, so the
`fitScore` can be written straight back onto a `JobPosting` row in the Excel
workbook produced by Part 1.

## Model & auth

Uses `claude-opus-4-8` via the official `@anthropic-ai/sdk`. Provide credentials
through `ANTHROPIC_API_KEY` (or an `ant auth login` profile). Override the model
per call with `{ model: "..." }`.

## CLI

```bash
npm run build
node packages/resume-matcher/dist/index.js resume.txt jd.txt --tailor
```
