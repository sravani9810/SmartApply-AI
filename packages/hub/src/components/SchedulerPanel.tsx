"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { controlSchedulerAction } from "../db/actions";
import type { SchedulerStatus } from "../lib/scheduler";

export function SchedulerPanel({ status }: { status: SchedulerStatus }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  const act = (cmd: "on" | "off" | "now") =>
    startTransition(async () => {
      setMsg(null);
      const r = await controlSchedulerAction(cmd);
      setMsg(r.ok ? (r.output ?? "Done.") : `⚠ ${r.error}`);
      router.refresh();
    });

  if (!status.supported) {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <p className="muted" style={{ margin: 0 }}>{status.error ?? "Scheduling is not available here."}</p>
      </div>
    );
  }

  return (
    <div className="panel" style={{ padding: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span className={`pill ${status.on ? "st-applied" : "st-not-applying"}`} style={{ fontSize: 12 }}>
            {status.on ? "● ON" : "○ OFF"}
          </span>
          <span className="muted" style={{ marginLeft: 10 }}>
            {status.on ? "Runs at minute 0 of every hour → scrapes into the hub." : "Not scheduled."}
          </span>
        </div>
        <div className="rowacts">
          {status.on ? (
            <button className="btn danger" disabled={pending} onClick={() => act("off")}>Turn off</button>
          ) : (
            <button className="btn on" disabled={pending} onClick={() => act("on")}>Turn on</button>
          )}
          <button className="btn" disabled={pending} onClick={() => act("now")}>Run now</button>
        </div>
      </div>

      {status.detail ? (
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          launchd: <code>{status.detail}</code>
        </p>
      ) : null}
      {status.logPath ? (
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Logs: <code>{status.logPath}</code>
        </p>
      ) : null}
      {msg ? <pre className="schedout">{msg}</pre> : null}
    </div>
  );
}
