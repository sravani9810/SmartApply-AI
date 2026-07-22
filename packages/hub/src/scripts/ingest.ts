import { runIngest } from "../lib/ingest";

// Entry point for the scheduler (launchd) and manual `npm run ingest`.
runIngest()
  .then((r) => {
    console.log(`[ingest] received ${r.received}, upserted ${r.written} job(s)`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("[ingest] failed:", e);
    process.exit(1);
  });
