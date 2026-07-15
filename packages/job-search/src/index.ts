import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load .env before anything reads process.env. npm workspace scripts run with
// cwd set to the package dir, so resolve the repo-root .env from this file's
// location (dist/index.js -> ../../../.env); also fall back to cwd/.env.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });
loadEnv(); // cwd/.env, does not override already-set vars

import type { JobPosting } from "@smartapply/shared";
import { getConfig } from "./config.js";
import { getActiveBoards } from "./boards/index.js";
import { enrichRecruiterContact } from "./recruiter/enrich.js";
import { saveJobs } from "./excel/workbook.js";
import { googleSheetsConfigFromEnv, syncToGoogleSheet } from "./sheets/gsheet.js";

/**
 * Part 1 orchestrator: search every configured board, enrich each posting with
 * recruiter contact details, and log the results to the Excel workbook.
 *
 * Intended to be invoked on a schedule (e.g. hourly cron on the local machine).
 */
export async function runJobSearch(): Promise<JobPosting[]> {
  const config = getConfig();
  const collected: JobPosting[] = [];

  for (const board of getActiveBoards()) {
    for (const query of config.queries) {
      console.log(
        `[job-search] ${board.source}: "${query.keywords.join(", ")}" in ` +
          `"${query.location}" (posted within ${query.postedWithinDays}d)`,
      );
      let postings: JobPosting[];
      try {
        postings = await board.search(query);
      } catch (err) {
        console.error(`[job-search] board "${board.source}" failed:`, err);
        continue;
      }
      for (const posting of postings) {
        collected.push(await enrichRecruiterContact(posting));
      }
    }
  }

  // Dedup within this run (the same job can match multiple searches) so the
  // sinks don't append the same posting twice.
  const jobs = Array.from(
    new Map(collected.map((p) => [p.id, p])).values(),
  );

  await saveJobs(jobs, config.workbookPath);
  console.log(
    `[job-search] saved ${jobs.length} posting(s) to ${config.workbookPath}`,
  );

  // Optional Google Sheets sync — runs only when GOOGLE_SHEETS_SPREADSHEET_ID
  // is set, so the pipeline stays local-only by default.
  const gsheet = googleSheetsConfigFromEnv();
  if (gsheet) {
    try {
      const { updated, appended } = await syncToGoogleSheet(jobs, gsheet);
      console.log(
        `[job-search] synced to Google Sheet ${gsheet.spreadsheetId} ` +
          `(${appended} new, ${updated} updated)`,
      );
    } catch (err) {
      console.error("[job-search] Google Sheets sync failed:", err);
    }
  }

  return jobs;
}

// Allow `node dist/index.js` to run the search directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  runJobSearch().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
