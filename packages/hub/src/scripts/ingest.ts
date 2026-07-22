import { runIngest } from "../lib/ingest";
import { getSchedulerSources } from "../db/queries";

// Entry point for the scheduler (launchd) and manual `npm run ingest`.
// Scrapes only the platforms toggled on in the hub's Scheduler page.
const sources = getSchedulerSources();

if (sources.length === 0) {
  console.log("[ingest] no platforms enabled for scheduling — nothing to do.");
  process.exit(0);
}

runIngest(undefined, sources)
  .then((r) => {
    console.log(
      `[ingest] platforms [${sources.join(", ")}] — received ${r.received}, upserted ${r.written} job(s)`,
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error("[ingest] failed:", e);
    process.exit(1);
  });
