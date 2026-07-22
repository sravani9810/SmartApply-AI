import { getSchedulerStatus } from "../../lib/scheduler";
import { SchedulerPanel } from "../../components/SchedulerPanel";

export const dynamic = "force-dynamic";

export default async function SchedulerPage() {
  const status = await getSchedulerStatus();

  return (
    <main className="wrap">
      <h1>Job-search scheduling</h1>
      <p className="sub">
        Control the macOS (launchd) agent that scrapes your searches on a schedule and
        imports them into the hub. Turning it on installs a per-user Login Item — nothing
        runs until you enable it here.
      </p>
      <SchedulerPanel status={status} />
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Scheduled runs use your <code>.env</code> search config and enabled boards
        (<code>INDEED_ENABLED</code> / <code>LINKEDIN_ENABLED</code>), and each board needs
        its one-time login. Live scrapes open a real Chrome window, so leave your machine
        unlocked for scheduled runs to complete.
      </p>
    </main>
  );
}
