import { getSchedulerStatus } from "../../lib/scheduler";
import { getSchedulerSources } from "../../db/queries";
import { SchedulerPanel } from "../../components/SchedulerPanel";

export const dynamic = "force-dynamic";

export default async function SchedulerPage() {
  const status = await getSchedulerStatus();
  const sources = getSchedulerSources();

  return (
    <main className="wrap">
      <h1>Job-search scheduling</h1>
      <p className="sub">
        Control the macOS (launchd) agent that scrapes your searches on a schedule and
        imports them into the hub. Turning it on installs a per-user Login Item — nothing
        runs until you enable it here.
      </p>
      <SchedulerPanel status={status} sources={sources} />
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Scheduled runs use your <code>.env</code> search keywords/location and scrape the
        platforms toggled above. Each platform needs its one-time login
        (<code>npm run login:indeed</code> / <code>login:linkedin</code>). Live scrapes open
        a real Chrome window, so leave your machine unlocked for scheduled runs to complete.
      </p>
    </main>
  );
}
