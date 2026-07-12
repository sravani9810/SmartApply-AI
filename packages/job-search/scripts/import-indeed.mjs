// Importer: turns a scraped Indeed capture (data/indeed-*.json) into JobPosting
// rows in the Excel workbook, reusing the package's own saveJobs + stableId.
//
// Usage (from repo root, after `npm run build`):
//   node packages/job-search/scripts/import-indeed.mjs \
//     packages/job-search/data/indeed-software-engineer-remote.json data/jobs.xlsx
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { saveJobs } from "../dist/excel/workbook.js";
import { stableId } from "../dist/boards/example-board.js";

const here = dirname(fileURLToPath(import.meta.url));
const capturePath =
  process.argv[2] ?? resolve(here, "../data/indeed-software-engineer-remote.json");
const outPath = process.argv[3] ?? "data/jobs.xlsx";

const capture = JSON.parse(await readFile(capturePath, "utf8"));
const now = new Date().toISOString();

const postings = capture.jobs.map((j) => {
  const url = `https://www.indeed.com/viewjob?jk=${j.jk}`;
  return {
    id: stableId(capture.source ?? "indeed", url),
    title: j.title,
    company: j.company,
    location: j.location,
    source: capture.source ?? "indeed",
    url,
    datePosted: j.datePosted,   // Indeed list view does not expose this
    endDate: j.endDate,         // Indeed does not publish an end date
    recruiter: j.recruiter,     // Indeed does not expose recruiter contact
    status: "new",
    capturedAt: now,
  };
});

await saveJobs(postings, outPath);
console.log(`Imported ${postings.length} ${capture.source} posting(s) -> ${outPath}`);
