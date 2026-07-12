import type { JobPosting } from "@smartapply/shared";
import { config } from "./config.js";
import { boards } from "./boards/index.js";
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
  const collected: JobPosting[] = [];

  for (const board of boards) {
    let postings: JobPosting[];
    try {
      postings = await board.search(config.query);
    } catch (err) {
      console.error(`[job-search] board "${board.source}" failed:`, err);
      continue;
    }
    for (const posting of postings) {
      collected.push(await enrichRecruiterContact(posting));
    }
  }

  await saveJobs(collected, config.workbookPath);
  console.log(
    `[job-search] saved ${collected.length} posting(s) to ${config.workbookPath}`,
  );

  // Optional Google Sheets sync — runs only when GOOGLE_SHEETS_SPREADSHEET_ID
  // is set, so the pipeline stays local-only by default.
  const gsheet = googleSheetsConfigFromEnv();
  if (gsheet) {
    try {
      const { updated, appended } = await syncToGoogleSheet(collected, gsheet);
      console.log(
        `[job-search] synced to Google Sheet ${gsheet.spreadsheetId} ` +
          `(${appended} new, ${updated} updated)`,
      );
    } catch (err) {
      console.error("[job-search] Google Sheets sync failed:", err);
    }
  }

  return collected;
}

// Allow `node dist/index.js` to run the search directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  runJobSearch().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
